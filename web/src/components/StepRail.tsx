// The wizard's step rail: four equal cells under the top bar. The current
// step is an accent fill with white 700-weight text.

const STEPS = ['1 · Product', '2 · Hero image', '3 · Volume', '4 · Scenes'];

export default function StepRail({ current }: { current: 1 | 2 | 3 | 4 }) {
  return (
    <div className="steprail">
      {STEPS.map((label, i) => (
        <div key={label} className={i + 1 === current ? 'steprail-cell active' : 'steprail-cell'}>
          {label}
        </div>
      ))}
    </div>
  );
}
