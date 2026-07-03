export function importRowNumber(item: any, index: number): number {
  const value = Number(item?.__row ?? item?.row);
  return Number.isInteger(value) && value >= 2 ? value : index + 2;
}
