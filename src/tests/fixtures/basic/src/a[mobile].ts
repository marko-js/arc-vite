import renderB from "./b";
const value = "a[mobile]";

export default function render() {
  return `${value}, ${renderB()}`;
}
