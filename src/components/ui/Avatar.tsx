export interface AvatarProps {
  name: string;
  size?: number;
  active?: boolean;
}

export default function Avatar({ name, size = 24, active = false }: AvatarProps) {
  const initials = name.slice(0, 2).toUpperCase();
  return (
    <div
      className={`avatar ${active ? "avatar-active" : ""}`}
      style={{ width: size, height: size, fontSize: size * 0.33 }}
      aria-hidden="true"
    >
      {initials}
    </div>
  );
}
