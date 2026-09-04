/** The severity derivation as a numbered list. Each item is a sentence
 *  the severity() function appended as it ran, so the chain can never
 *  contradict the level it explains. */
export function ReasonChain({ reasons }: { reasons: string[] }) {
  return (
    <ol className="reason-chain">
      {reasons.map((r, i) => (
        <li key={i}>{r}</li>
      ))}
    </ol>
  );
}
