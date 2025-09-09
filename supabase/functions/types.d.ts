// Ambient declarations so TypeScript recognizes the Deno global when editing edge functions
declare const Deno: {
  env: { get(name: string): string | undefined }
};


