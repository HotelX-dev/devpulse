import { getInitials } from '../../lib/utils';

interface AvatarProps {
  name: string;
  color?: string;
  size?: 'sm' | 'md' | 'lg';
}

const sizes = {
  sm: { wh: 28, font: 11 },
  md: { wh: 36, font: 13 },
  lg: { wh: 48, font: 16 },
};

export default function Avatar({ name, color = '#A78BFA', size = 'md' }: AvatarProps) {
  const { wh, font } = sizes[size];
  return (
    <div
      style={{
        width: wh,
        height: wh,
        borderRadius: '50%',
        background: color + '33',
        border: `1.5px solid ${color}55`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: font,
        fontWeight: 600,
        color,
        flexShrink: 0,
        userSelect: 'none',
      }}
    >
      {getInitials(name)}
    </div>
  );
}
