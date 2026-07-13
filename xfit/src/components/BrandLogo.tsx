import React from 'react';
import { Image, ImageStyle, StyleProp } from 'react-native';

const logos = {
  fullColour: require('../../assets/brand-full-colour.png'),
  fullWhite: require('../../assets/brand-full-white.png'),
  markColour: require('../../assets/brand-logo-colour.png'),
};

type BrandLogoProps = {
  variant?: keyof typeof logos;
  style: StyleProp<ImageStyle>;
  accessibilityLabel?: string;
};

export default function BrandLogo({
  variant = 'fullColour',
  style,
  accessibilityLabel = 'Tailor-Xfit logo',
}: BrandLogoProps) {
  return (
    <Image
      source={logos[variant]}
      style={style}
      resizeMode="contain"
      accessibilityLabel={accessibilityLabel}
    />
  );
}
