const assetFileReg =
  /\.(?:a?png|jpe?g|jfif|pipeg|pjp|gif|svg|ico|web[pm]|avif|mp4|ogg|mp3|wav|flac|aac|opus|woff2?|eot|[ot]tf|webmanifest|pdf|txt)(\?|$)/;
const globalCSSFileReg =
  /(?<!\.module)\.(css|less|sass|scss|styl|stylus|pcss|postcss|sss)(?:$|\?)/;

export function isAssetFile(id: string) {
  return assetFileReg.test(id);
}

export function isGlobalCSSFile(id: string) {
  return globalCSSFileReg.test(id);
}
