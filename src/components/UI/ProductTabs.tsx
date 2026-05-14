import type { Product } from '../../types';

interface ProductTabsProps {
  products: Product[];
  selected: string;
  onChange: (id: string) => void;
}

export default function ProductTabs({ products, selected, onChange }: ProductTabsProps) {
  return (
    <div
      className="dp-product-tabs"
      style={{
        display: 'flex',
        gap: 6,
        flexWrap: 'nowrap',
        overflowX: 'auto',
        WebkitOverflowScrolling: 'touch',
        paddingBottom: 4,
        marginBottom: -4,
      }}
    >
      {products.map(p => {
        const active = p.id === selected;
        return (
          <button
            key={p.id}
            onClick={() => onChange(p.id)}
            style={{
              padding: '6px 18px',
              borderRadius: 99,
              fontSize: 13,
              fontWeight: 600,
              border: active ? 'none' : '1px solid var(--border2)',
              background: active ? 'var(--accent)' : 'transparent',
              color: active ? '#fff' : 'var(--text2)',
              cursor: 'pointer',
              transition: 'all 0.15s',
              fontFamily: 'var(--font-sans)',
            }}
          >
            {p.name}
          </button>
        );
      })}
    </div>
  );
}
