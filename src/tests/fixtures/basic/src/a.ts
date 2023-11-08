import renderB from "./b";
const value = "a";

export default function render() {
  return `${value}, ${renderB()}`;
}
