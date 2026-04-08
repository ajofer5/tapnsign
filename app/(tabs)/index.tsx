import { BrandColors, BrandFonts } from '@/constants/theme';
import { Link } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

export default function HomeScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>TapnSign</Text>

      <Link href="/capture" style={styles.link}>
        Capture Autograph
      </Link>

      <Link href="/autographs" style={styles.link}>
        View Autographs
      </Link>

      <Link href="/marketplace" style={[styles.link, { paddingLeft: 8 }]}>
        Marketplace
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: BrandColors.background,
  },
  title: {
    fontSize: 120,
    lineHeight: 155,
    fontWeight: '700',
    marginBottom: 88,
    paddingRight: 12,
    fontFamily: BrandFonts.script,
    color: BrandColors.primary,
  },
  link: {
    fontSize: 50,
    lineHeight: 64,
    marginBottom: 22,
    paddingRight: 8,
    fontFamily: BrandFonts.script,
    color: BrandColors.primary,
  },
});