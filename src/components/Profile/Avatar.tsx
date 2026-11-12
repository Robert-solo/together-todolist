import type { User } from '../../store/authStore'

const HUES = [178, 250, 300, 25, 145, 340, 210, 60]

function hueFor(seed: string) {
  let h = 0
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return HUES[h % HUES.length]
}

interface Props {
  user: Pick<User, 'id' | 'displayName' | 'avatar'>
  size?: number
}

export function Avatar({ user, size = 36 }: Props) {
  const box = {
    width: size, height: size, borderRadius: '50%', flexShrink: 0,
    overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center',
  } as const

  if (user.avatar) {
    return (
      <span style={box}>
        <img src={user.avatar} alt={user.displayName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </span>
    )
  }
  const hue = hueFor(user.id)
  return (
    <span style={{
      ...box, color: '#fff', fontWeight: 600, fontSize: size * 0.42,
      background: `linear-gradient(135deg, oklch(62% 0.14 ${hue}), oklch(48% 0.13 ${hue + 30}))`,
    }}>
      {[...user.displayName][0]?.toUpperCase() ?? '?'}
    </span>
  )
}
