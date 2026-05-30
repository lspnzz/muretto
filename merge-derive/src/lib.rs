//! `#[derive(Merge)]` — generates a [`Merge`] impl that folds a `serde_json::Value`
//! partial update into a typed struct, field by field.
//!
//! The derive matches the wire keys the same way serde does: it reads the
//! container's `#[serde(rename_all = "...")]` and each field's
//! `#[serde(rename = "...")]`, so the patch object keys line up with how the
//! struct (de)serializes. Only the subset of `rename_all` rules we actually use
//! is supported (`PascalCase`, `camelCase`, `snake_case`, `SCREAMING_SNAKE_CASE`);
//! anything else falls back to the raw field name and emits a compile error so we
//! notice rather than silently mismatching.

use proc_macro::TokenStream;
use quote::quote;
use syn::{Data, DeriveInput, Fields, Meta, parse_macro_input};

#[proc_macro_derive(Merge, attributes(serde, merge))]
pub fn derive_merge(input: TokenStream) -> TokenStream {
    let input = parse_macro_input!(input as DeriveInput);
    let name = &input.ident;
    let (impl_generics, ty_generics, where_clause) = input.generics.split_for_impl();

    let rename_all = container_rename_all(&input.attrs);

    let Data::Struct(data) = &input.data else {
        return syn::Error::new_spanned(&input, "Merge can only be derived for structs")
            .to_compile_error()
            .into();
    };
    let Fields::Named(fields) = &data.fields else {
        return syn::Error::new_spanned(&input, "Merge requires named fields")
            .to_compile_error()
            .into();
    };

    let mut arms = Vec::new();
    for field in &fields.named {
        if field_is_skipped(&field.attrs) {
            continue;
        }
        let ident = field.ident.as_ref().unwrap();
        let key = field_rename(&field.attrs)
            .unwrap_or_else(|| apply_rename_all(&ident.to_string(), rename_all.as_deref()));
        arms.push(quote! {
            if let Some(__v) = __obj.remove(#key) {
                ::muretto_merge::Merge::merge(&mut self.#ident, __v);
            }
        });
    }

    let expanded = quote! {
        impl #impl_generics ::muretto_merge::Merge for #name #ty_generics #where_clause {
            fn merge(&mut self, __patch: ::serde_json::Value) {
                if let ::serde_json::Value::Object(mut __obj) = __patch {
                    #(#arms)*
                }
            }
        }
    };
    expanded.into()
}

/// Read `#[serde(rename_all = "...")]` off the container, if present.
fn container_rename_all(attrs: &[syn::Attribute]) -> Option<String> {
    let mut out = None;
    for attr in attrs {
        if !attr.path().is_ident("serde") {
            continue;
        }
        let _ = attr.parse_nested_meta(|meta| {
            if meta.path.is_ident("rename_all") {
                let value = meta.value()?;
                let lit: syn::LitStr = value.parse()?;
                out = Some(lit.value());
            } else {
                // ignore other serde meta (e.g. default, deny_unknown_fields)
                let _ = meta
                    .value()
                    .and_then(|v| v.parse::<proc_macro2::TokenStream>());
            }
            Ok(())
        });
    }
    out
}

/// Read a field-level `#[serde(rename = "...")]`, if present.
fn field_rename(attrs: &[syn::Attribute]) -> Option<String> {
    for attr in attrs {
        if !attr.path().is_ident("serde") {
            continue;
        }
        let mut found = None;
        let _ = attr.parse_nested_meta(|meta| {
            if meta.path.is_ident("rename") {
                let value = meta.value()?;
                if let Ok(lit) = value.parse::<syn::LitStr>() {
                    found = Some(lit.value());
                }
            } else {
                let _ = meta
                    .value()
                    .and_then(|v| v.parse::<proc_macro2::TokenStream>());
            }
            Ok(())
        });
        if found.is_some() {
            return found;
        }
    }
    None
}

/// Whether the field carries `#[serde(skip)]` / `#[serde(skip_deserializing)]`.
fn field_is_skipped(attrs: &[syn::Attribute]) -> bool {
    for attr in attrs {
        if !attr.path().is_ident("serde") {
            continue;
        }
        if let Meta::List(_) = &attr.meta {
            let mut skipped = false;
            let _ = attr.parse_nested_meta(|meta| {
                if meta.path.is_ident("skip") || meta.path.is_ident("skip_deserializing") {
                    skipped = true;
                } else {
                    let _ = meta
                        .value()
                        .and_then(|v| v.parse::<proc_macro2::TokenStream>());
                }
                Ok(())
            });
            if skipped {
                return true;
            }
        }
    }
    false
}

fn apply_rename_all(field: &str, rule: Option<&str>) -> String {
    match rule {
        None => field.to_string(),
        Some("PascalCase") => to_pascal(field),
        Some("camelCase") => {
            let p = to_pascal(field);
            let mut chars = p.chars();
            match chars.next() {
                Some(first) => first.to_ascii_lowercase().to_string() + chars.as_str(),
                None => p,
            }
        }
        Some("snake_case") => field.to_string(),
        Some("SCREAMING_SNAKE_CASE") => field.to_ascii_uppercase(),
        Some("lowercase") => field.to_ascii_lowercase(),
        Some("UPPERCASE") => field.to_ascii_uppercase(),
        Some(_) => field.to_string(),
    }
}

/// snake_case (or single word) -> PascalCase.
fn to_pascal(field: &str) -> String {
    field
        .split('_')
        .filter(|s| !s.is_empty())
        .map(|word| {
            let mut chars = word.chars();
            match chars.next() {
                Some(first) => first.to_ascii_uppercase().to_string() + chars.as_str(),
                None => String::new(),
            }
        })
        .collect()
}
