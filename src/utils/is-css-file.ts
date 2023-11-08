const cssFileReg =
  /(?<!\.module)\.(css|less|sass|scss|styl|stylus|pcss|postcss|sss)(?:$|\?)/;

export function isCssFile(id: string) {
  return cssFileReg.test(id);
}
