declare module "*.md" {
  const content: string;
  export default content;
}

declare module "*.png" {
  const assetPath: string;
  export default assetPath;
}
