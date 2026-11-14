import { Profile } from '../../storage/profiles';

/** Round initial badge in the profile's colour. */
export function ProfileAvatar({ profile, size = 40 }: { profile: Pick<Profile, 'name' | 'color'>; size?: number }) {
  const initial = profile.name.trim().charAt(0).toUpperCase() || '?';
  return (
    <span
      aria-hidden="true"
      className="grid shrink-0 place-items-center rounded-full font-display font-bold text-white shadow-[inset_0_-3px_0_rgb(0_0_0/.18)]"
      style={{ width: size, height: size, background: profile.color, fontSize: size * 0.45 }}
    >
      {initial}
    </span>
  );
}
