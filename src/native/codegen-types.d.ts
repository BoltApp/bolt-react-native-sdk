/**
 * Ambient module declaration for React Native codegen types.
 *
 * The canonical declaration exists in react-native/types/modules/Codegen.d.ts
 * but is not resolvable under moduleResolution: "bundler" because react-native
 * does not include this path in its package.json "exports" map.
 *
 * Codegen requires the import to come from this exact module path.
 */
declare module 'react-native/Libraries/Types/CodegenTypes' {
  import type { NativeSyntheticEvent } from 'react-native';

  export type BubblingEventHandler<
    T,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    PaperName extends string | never = never,
  > = (event: NativeSyntheticEvent<T>) => void | Promise<void>;

  export type DirectEventHandler<
    T,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    PaperName extends string | never = never,
  > = (event: NativeSyntheticEvent<T>) => void | Promise<void>;

  export type Double = number;
  export type Float = number;
  export type Int32 = number;
}
