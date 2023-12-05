const assetFileReg =
  /\.(?:a?png|jpe?g|jfif|pipeg|pjp|gif|svg|ico|web[pm]|avif|mp4|ogg|mp3|wav|flac|aac|opus|woff2?|eot|[ot]tf|webmanifest|pdf|txt)(\?|$)/;
const scriptFileReg = /\.(?:[mc]?[tj]s|json)(\?|$)/;
const cssFileReg =
  /\.(?:css|less|sass|scss|styl|stylus|pcss|postcss|sss)(\?|$)/;
const cssModuleReg = /\.module\.[^.]+)(?:$|\?)/;

export function isAssetFile(id: string) {
  return assetFileReg.test(id);
}

export function isScriptFile(id: string) {
  return scriptFileReg.test(id);
}

export function isCssFile(id: string) {
  return cssFileReg.test(id);
}

export function isGlobalCSSFile(id: string) {
  return cssFileReg.test(id) && !cssModuleReg.test(id);
}

export function isBuiltInFile(id: string) {
  return scriptFileReg.test(id) || assetFileReg.test(id) || cssFileReg.test(id);
}
