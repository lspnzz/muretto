//! The [`Merge`] trait and its leaf implementations.
//!
//! `Merge` folds a deep-partial `serde_json::Value` update into a typed value
//! in place. The canonical state tree is fully typed; partial updates arrive as
//! `Value` and are merged field-by-field. This keeps the partial wire shape from
//! polluting the type model with a parallel `Partial<T>` tree, while the merge
//! target stays a real, validated struct.
//!
//! Re-exports `#[derive(Merge)]` so `use muretto_merge::Merge;` brings both the
//! trait and the derive into scope (the serde / serde_derive pattern).

// Lets the re-exported `#[derive(Merge)]` resolve `::muretto_merge` even when
// used inside this crate's own tests.
extern crate self as muretto_merge;

pub use merge_derive::Merge;

use indexmap::IndexMap;
use serde::de::DeserializeOwned;
use serde_json::Value;

/// Apply a deep-partial JSON `patch` onto `self`, in place.
///
/// Semantics by type:
/// - scalars / `Vec`: a present value replaces.
/// - structs (`#[derive(Merge)]`): each present object key merges into its field.
/// - `Option<T>`: `null` clears to `None`; a value merges into `Some` or sets it.
/// - keyed collections (`IndexMap<String, V>`): per-key add / deep-update /
///   remove-on-null, preserving insertion order.
pub trait Merge {
    fn merge(&mut self, patch: Value);
}

/// Generic JSON value: deep-merge objects key-by-key (null removes a key),
/// replace everything else. This is the loose escape hatch for ragged topics.
impl Merge for Value {
    fn merge(&mut self, patch: Value) {
        match patch {
            Value::Object(patch_map) => {
                if let Value::Object(base) = self {
                    for (k, v) in patch_map {
                        if v.is_null() {
                            base.remove(&k);
                        } else if let Some(slot) = base.get_mut(&k) {
                            slot.merge(v);
                        } else {
                            base.insert(k, v);
                        }
                    }
                } else {
                    *self = Value::Object(patch_map);
                }
            }
            other => *self = other,
        }
    }
}

/// `Option<T>`: present `null` clears; otherwise merge into the inner value
/// (deserializing fresh when currently `None`).
impl<T> Merge for Option<T>
where
    T: Merge + DeserializeOwned,
{
    fn merge(&mut self, patch: Value) {
        if patch.is_null() {
            *self = None;
            return;
        }
        match self {
            Some(inner) => inner.merge(patch),
            None => *self = serde_json::from_value(patch).ok(),
        }
    }
}

/// Keyed collection (arrays-as-objects in the F1 feed): add / deep-update /
/// remove-on-null, preserving insertion order.
impl<V> Merge for IndexMap<String, V>
where
    V: Merge + DeserializeOwned,
{
    fn merge(&mut self, patch: Value) {
        let Value::Object(map) = patch else {
            return;
        };
        for (k, v) in map {
            if v.is_null() {
                self.shift_remove(&k);
            } else if let Some(existing) = self.get_mut(&k) {
                existing.merge(v);
            } else if let Ok(new) = serde_json::from_value(v) {
                self.insert(k, new);
            }
        }
    }
}

/// `Vec<T>`: a present array replaces wholesale (append-style feed arrays are
/// always re-sent in full, so there is no per-index merge to do).
impl<T> Merge for Vec<T>
where
    T: DeserializeOwned,
{
    fn merge(&mut self, patch: Value) {
        if let Ok(v) = serde_json::from_value(patch) {
            *self = v;
        }
    }
}

macro_rules! impl_merge_replace {
    ($($t:ty),* $(,)?) => {$(
        impl Merge for $t {
            fn merge(&mut self, patch: Value) {
                if let Ok(v) = serde_json::from_value(patch) {
                    *self = v;
                }
            }
        }
    )*};
}

impl_merge_replace!(
    bool, char, String, f32, f64, i8, i16, i32, i64, i128, isize, u8, u16, u32, u64, u128, usize,
);

#[cfg(test)]
mod tests {
    use super::*;
    use serde::{Deserialize, Serialize};
    use serde_json::json;

    #[derive(Debug, PartialEq, Serialize, Deserialize, Merge)]
    #[serde(rename_all = "PascalCase")]
    struct Driver {
        racing_number: String,
        #[serde(rename = "Tla")]
        tla: String,
        position: Option<i32>,
    }

    #[test]
    fn scalar_replace() {
        let mut s = String::from("a");
        s.merge(json!("b"));
        assert_eq!(s, "b");
    }

    #[test]
    fn derived_struct_merges_named_keys_and_leaves_siblings() {
        let mut d = Driver {
            racing_number: "44".into(),
            tla: "HAM".into(),
            position: Some(3),
        };
        // PascalCase rename_all -> "Position"; per-field rename -> "Tla".
        d.merge(json!({ "Position": 1 }));
        assert_eq!(d.position, Some(1));
        assert_eq!(d.tla, "HAM"); // untouched
        assert_eq!(d.racing_number, "44"); // untouched
    }

    #[test]
    fn option_clears_on_null() {
        let mut d = Driver {
            racing_number: "44".into(),
            tla: "HAM".into(),
            position: Some(3),
        };
        d.merge(json!({ "Position": null }));
        assert_eq!(d.position, None);
    }

    #[test]
    fn indexmap_add_update_remove() {
        let mut map: IndexMap<String, Driver> = IndexMap::new();
        map.insert(
            "44".into(),
            Driver {
                racing_number: "44".into(),
                tla: "HAM".into(),
                position: Some(2),
            },
        );
        // add
        map.merge(json!({ "16": { "RacingNumber": "16", "Tla": "LEC", "Position": 1 } }));
        assert!(map.contains_key("16"));
        // deep update (only Position)
        map.merge(json!({ "44": { "Position": 1 } }));
        assert_eq!(map["44"].position, Some(1));
        assert_eq!(map["44"].tla, "HAM");
        // remove
        map.merge(json!({ "44": null }));
        assert!(!map.contains_key("44"));
        // insertion order preserved (16 still first)
        assert_eq!(map.keys().next().map(String::as_str), Some("16"));
    }

    #[test]
    fn value_deep_merge() {
        let mut v = json!({ "a": { "x": 1, "y": 2 }, "b": 3 });
        v.merge(json!({ "a": { "y": 9 }, "c": 4 }));
        assert_eq!(v, json!({ "a": { "x": 1, "y": 9 }, "b": 3, "c": 4 }));
    }
}
