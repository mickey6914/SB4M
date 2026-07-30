// Static stand-in for screens that arrive in later increments. Increment 1
// delivers the shell and routing only.

type Props = {
  kicker: string;
  title: string;
  lead: string;
  increment: number;
};

export default function Placeholder({ kicker, title, lead, increment }: Props) {
  return (
    <section className="page">
      <div className="page-kicker">{kicker}</div>
      <h1>{title}</h1>
      <p className="page-lead">{lead}</p>
      <span className="page-note">Static placeholder — this screen is built in increment {increment}.</span>
    </section>
  );
}
