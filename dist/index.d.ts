import { PluginOption } from "vite";
type Options = {
    /**
     * Control where the JSX factory is imported from.
     * @default "@poprize/react"
     */
    jsxImportSource?: string;
};
declare const react: (options?: Options) => PluginOption[];
export default react;
