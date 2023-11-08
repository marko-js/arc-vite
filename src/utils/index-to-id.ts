const ID_START_CHARS = "hjkmoquxzABCDEFGHIJKLNPQRTUVWXYZ$_"; // Avoids chars that could evaluate to a reserved word.
const ID_START_CHARS_LEN = ID_START_CHARS.length;
const ID_CHARS =
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789$_";
const ID_CHARS_LEN = ID_CHARS.length;

export function indexToId(i: number) {
  let mod = i % ID_START_CHARS_LEN;
  let id = ID_START_CHARS[mod];
  i = (i - mod) / ID_START_CHARS_LEN;

  while (i > 0) {
    mod = i % ID_CHARS_LEN;
    id += ID_CHARS[mod];
    i = (i - mod) / ID_CHARS_LEN;
  }

  return id;
}
