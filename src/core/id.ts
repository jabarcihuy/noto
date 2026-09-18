/** Stable ID generation. The concrete generator is injected at the wiring point. */
export type IdGenerator = () => string;
