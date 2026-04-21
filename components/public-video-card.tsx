import { BrandFonts } from '@/constants/theme';
import { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, TextStyle, View } from 'react-native';

export function NameWithSequence({ name, sequenceNumber, style }: { name: string; sequenceNumber?: number | null; style?: TextStyle }) {
  if (sequenceNumber == null) return <Text style={style}>{name}</Text>;
  const hashSize = Math.round((style?.fontSize ?? 16) * 0.58);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
      <Text style={style}>{name}</Text>
      <Text style={style}>{' · '}</Text>
      <Text style={[style, { fontSize: hashSize, lineHeight: hashSize }]}>#</Text>
      <Text style={style}>{String(sequenceNumber)}</Text>
    </View>
  );
}

/** @deprecated use NameWithSequence component */
export function nameWithSequence(name: string, sequenceNumber: number | null | undefined): ReactNode {
  return <NameWithSequence name={name} sequenceNumber={sequenceNumber} />;
}

export function formatPublicVideoPrice(cents: number | null) {
  if (!cents) return '$0.00';
  return `$${(cents / 100).toFixed(2)}`;
}

export function formatPublicVideoDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

type PublicVideoCardProps = {
  name: string;
  sequenceNumber?: number | null;
  date?: string;
  verified?: boolean;
  gold?: boolean;
  seriesName?: string | null;
  seriesEdition?: string | null;
  priceText: string;
  secondaryText?: string | null;
  onPress?: () => void;
  renderThumbnail: () => ReactNode;
  trailing?: ReactNode;
};

export function PublicVideoCard({
  name,
  sequenceNumber,
  date,
  verified = false,
  gold = false,
  seriesName,
  seriesEdition,
  priceText,
  secondaryText,
  onPress,
  renderThumbnail,
  trailing,
}: PublicVideoCardProps) {
  const content = (
    <>
      {renderThumbnail()}
      <View style={styles.info}>
        <View>
          <NameWithSequence name={name} sequenceNumber={sequenceNumber} style={styles.name} />
          {seriesName ? (
            <Text style={styles.series}>
              <Text style={styles.seriesName}>{seriesName}</Text>
              {seriesEdition ? <Text style={styles.seriesEdition}>{` · ${seriesEdition}`}</Text> : null}
            </Text>
          ) : null}
          {date ? <Text style={styles.date}>{date}</Text> : null}
          <View style={styles.badgeRow}>
            {verified ? <Text style={styles.verifiedBadge}>Verified</Text> : null}
            {gold ? <Text style={styles.goldBadge}>Gold</Text> : null}
          </View>
        </View>
        <View style={styles.details}>
          <Text style={styles.price}>{priceText}</Text>
          {secondaryText ? <Text style={styles.secondary}>{secondaryText}</Text> : null}
          {trailing}
        </View>
      </View>
    </>
  );

  if (onPress) return <Pressable style={styles.card} onPress={onPress}>{content}</Pressable>;
  return <View style={styles.card}>{content}</View>;
}

export const publicVideoCardStyles = StyleSheet.create({
  thumbnailShell: {
    width: 176,
    height: 208,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#050505',
  },
});

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 14,
    padding: 14,
    borderRadius: 20,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e9dcc1',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  info: {
    flex: 1,
    justifyContent: 'space-between',
  },
  name: {
    fontSize: 20,
    lineHeight: 25,
    fontWeight: '700',
    color: '#111',
    fontFamily: BrandFonts.primary,
  },
  series: {
    fontSize: 18,
    lineHeight: 18,
    fontFamily: BrandFonts.primary,
    fontStyle: 'italic',
    marginTop: 4,
  },
  seriesName: {
    color: '#111',
    fontFamily: BrandFonts.primary,
  },
  seriesEdition: {
    color: '#888',
    fontFamily: BrandFonts.primary,
    fontStyle: 'normal',
  },
  date: {
    fontSize: 13,
    color: '#666',
    marginTop: 6,
    fontFamily: BrandFonts.primary,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  verifiedBadge: {
    fontSize: 11,
    color: '#fff',
    backgroundColor: '#111',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: 'flex-start',
    overflow: 'hidden',
    fontFamily: BrandFonts.primary,
    fontWeight: '700',
  },
  goldBadge: {
    fontSize: 11,
    color: '#7A4B00',
    backgroundColor: '#F7E5BF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    overflow: 'hidden',
    fontFamily: BrandFonts.primary,
    fontWeight: '700',
  },
  details: {
    marginTop: 18,
  },
  price: {
    fontSize: 28,
    lineHeight: 32,
    fontWeight: '800',
    color: '#111',
    fontFamily: BrandFonts.primary,
  },
  secondary: {
    fontSize: 13,
    lineHeight: 18,
    color: '#666',
    marginTop: 6,
    fontFamily: BrandFonts.primary,
  },
});
