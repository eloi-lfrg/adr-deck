/** YAML scalar, quoted only when needed. */
export function yamlScalar(value: string): string {
  return /^[\p{L}\p{N}][\p{L}\p{N} .'()&/+-]*$/u.test(value) && !/^(?:true|false|null|yes|no|on|off|~)$/iu.test(value) ? value : JSON.stringify(value);
}
