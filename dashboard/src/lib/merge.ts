// Client-side deep merge, mirroring the server's `Merge for Value` semantics so
// the delta stream the backend sends folds into the same shape it serialized
// from. Objects merge key-by-key, `null` removes a key (keyed-collection remove),
// and arrays / scalars replace wholesale.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

export function deepMerge(base: Any, patch: Any): Any {
  // Non-object (scalar, array, null) patches replace the target outright.
  if (patch === null || typeof patch !== "object" || Array.isArray(patch)) {
    return patch;
  }
  const out: Record<string, Any> =
    base && typeof base === "object" && !Array.isArray(base) ? { ...base } : {};

  for (const [key, value] of Object.entries(patch)) {
    if (value === null) {
      delete out[key];
    } else {
      out[key] = deepMerge(out[key], value);
    }
  }
  return out;
}
