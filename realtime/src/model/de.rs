//! Custom deserialization helpers.
//!
//! The F1 feed represents the same logical collection two different ways: the
//! INITIAL snapshot often sends a JSON **array**, while subsequent partial
//! updates send an **object keyed by stringified index** (`{"0": .., "2": ..}`).
//! [`index_map_or_array`] accepts either and normalizes to an insertion-ordered
//! [`IndexMap<String, V>`], so a field can be loaded from either shape.

use std::fmt;
use std::marker::PhantomData;

use indexmap::IndexMap;
use serde::Deserialize;
use serde::de::{Deserializer, MapAccess, SeqAccess, Visitor};

/// Deserialize a field as `IndexMap<String, V>` from either a JSON array
/// (keyed by positional index) or a JSON object (keyed by its string keys).
pub fn index_map_or_array<'de, D, V>(deserializer: D) -> Result<IndexMap<String, V>, D::Error>
where
    D: Deserializer<'de>,
    V: Deserialize<'de>,
{
    struct MapOrArray<V>(PhantomData<V>);

    impl<'de, V> Visitor<'de> for MapOrArray<V>
    where
        V: Deserialize<'de>,
    {
        type Value = IndexMap<String, V>;

        fn expecting(&self, f: &mut fmt::Formatter) -> fmt::Result {
            f.write_str("an array or an object keyed by index")
        }

        fn visit_seq<A>(self, mut seq: A) -> Result<Self::Value, A::Error>
        where
            A: SeqAccess<'de>,
        {
            let mut out = IndexMap::new();
            let mut i = 0usize;
            while let Some(value) = seq.next_element::<V>()? {
                out.insert(i.to_string(), value);
                i += 1;
            }
            Ok(out)
        }

        fn visit_map<A>(self, mut map: A) -> Result<Self::Value, A::Error>
        where
            A: MapAccess<'de>,
        {
            let mut out = IndexMap::new();
            while let Some((key, value)) = map.next_entry::<String, V>()? {
                out.insert(key, value);
            }
            Ok(out)
        }
    }

    deserializer.deserialize_any(MapOrArray(PhantomData))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde::Deserialize;
    use serde_json::json;

    #[derive(Deserialize, PartialEq, Debug)]
    struct Holder {
        #[serde(deserialize_with = "index_map_or_array")]
        items: IndexMap<String, i32>,
    }

    #[test]
    fn array_and_object_yield_same_map() {
        let from_array: Holder = serde_json::from_value(json!({ "items": [10, 20, 30] })).unwrap();
        let from_object: Holder =
            serde_json::from_value(json!({ "items": { "0": 10, "1": 20, "2": 30 } })).unwrap();
        assert_eq!(from_array, from_object);
        assert_eq!(from_array.items["1"], 20);
    }
}
