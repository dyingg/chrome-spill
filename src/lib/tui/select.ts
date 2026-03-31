import { isCancel, type SelectOptions, select } from "@clack/prompts";
import { CliError } from "../errors.js";

export type SelectOption<T> = SelectOptions<T>["options"][number];

export async function selectOne<T>(options: {
  maxItems?: number;
  message: string;
  options: SelectOption<T>[];
}): Promise<T> {
  const result = await select(options);

  if (isCancel(result)) {
    throw new CliError("Selection cancelled.", 1);
  }

  return result as T;
}
