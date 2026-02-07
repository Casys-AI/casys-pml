declare module 'gray-matter' {
  interface GrayMatterFile<T = any> {
    data: T;
    content: string;
    excerpt?: string;
    orig: Buffer | string;
    language: string;
    matter: string;
    stringify(lang?: string): string;
  }

  interface GrayMatterOption<T = any> {
    parser?: any;
    eval?: boolean;
    excerpt?: boolean | ((file: GrayMatterFile<T>, options: GrayMatterOption<T>) => string);
    excerpt_separator?: string;
    engines?: {
      [index: string]: ((input: string) => object) | { parse: (input: string) => object; stringify?: (data: object) => string };
    };
    language?: string;
    delimiters?: string | [string, string];
  }

  function matter<T = any>(input: string | Buffer, options?: GrayMatterOption<T>): GrayMatterFile<T>;

  namespace matter {
    function read<T = any>(filepath: string, options?: GrayMatterOption<T>): GrayMatterFile<T>;
    function stringify<T = any>(file: string | GrayMatterFile<T>, data?: T, options?: GrayMatterOption<T>): string;
    function test(str: string, options?: GrayMatterOption): boolean;
    function language(str: string, options?: GrayMatterOption): string;
  }

  export = matter;
}
