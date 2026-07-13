type BrandLogoProps = {
  variant?: 'colour' | 'white' | 'mark';
  className?: string;
};

const sources = {
  colour: '/brand/txfit-full-colour.png',
  white: '/brand/txfit-full-white.png',
  mark: '/brand/txfit-mark-colour.png',
};

export default function BrandLogo({
  variant = 'colour',
  className = 'h-9 w-auto',
}: BrandLogoProps) {
  return (
    <img
      src={sources[variant]}
      alt="Tailor-Xfit"
      className={className}
      loading="eager"
    />
  );
}
