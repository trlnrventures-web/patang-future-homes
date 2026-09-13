export function startingFrom(range: string): string {
  const match = range.match(
    /₹\s*([\d,]+(?:\.\d+)?(?:\s?(?:Lacs?|Lakh|L|Crore|Cr))?)/
  );
  return match ? `₹${match[1]}` : range;
}