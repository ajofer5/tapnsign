import { BrandColors, BrandFonts } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';
import { callEdgeFunction } from '@/lib/api';
import { openAuthenticatedWebPath } from '@/lib/web-handoff';
import { supabase } from '@/lib/supabase';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useStripe } from '@stripe/stripe-react-native';

type PersonalizedRequest = {
  id: string;
  creator_id: string;
  requester_id: string;
  recipient_name: string;
  inscription_text: string | null;
  requester_note: string | null;
  amount_cents: number;
  counter_amount_cents: number | null;
  status: 'pending' | 'countered' | 'accepted' | 'declined' | 'withdrawn' | 'expired' | 'fulfilled' | 'completed';
  expires_at: string;
  payment_due_at?: string | null;
  completed_transfer_id?: string | null;
  responded_at: string | null;
  accepted_at: string | null;
  created_at: string;
  creator?: { display_name?: string | null } | null;
  requester?: { display_name?: string | null } | null;
};

const PERSONALIZED_REQUESTS_PAGE_SIZE = 100;
const PERSONALIZED_REQUESTS_STALE_MS = 30_000;

function formatMoney(cents: number | null | undefined) {
  if (typeof cents !== 'number') return '—';
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDate(value: string | null | undefined) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatCurrencyInput(raw: string) {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  return (Number.parseInt(digits, 10) / 100).toFixed(2);
}

export default function PersonalizedRequestsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [requests, setRequests] = useState<PersonalizedRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [counterTarget, setCounterTarget] = useState<PersonalizedRequest | null>(null);
  const [counterAmount, setCounterAmount] = useState('');
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const lastLoadedAtRef = useRef<number | null>(null);

  const loadRequests = useCallback(async (options?: { force?: boolean }) => {
    if (!user) return;
    const now = Date.now();
    if (!options?.force && lastLoadedAtRef.current && now - lastLoadedAtRef.current < PERSONALIZED_REQUESTS_STALE_MS) {
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('personalized_autograph_requests')
        .select(`
          id,
          creator_id,
          requester_id,
          recipient_name,
          inscription_text,
          requester_note,
          amount_cents,
          counter_amount_cents,
          status,
          expires_at,
          payment_due_at,
          completed_transfer_id,
          responded_at,
          accepted_at,
          created_at,
          creator:creator_id ( display_name ),
          requester:requester_id ( display_name )
        `)
        .or(`creator_id.eq.${user.id},requester_id.eq.${user.id}`)
        .order('created_at', { ascending: false })
        .limit(PERSONALIZED_REQUESTS_PAGE_SIZE);

      if (error) throw error;
      setRequests((data as PersonalizedRequest[]) ?? []);
      lastLoadedAtRef.current = Date.now();
    } catch (error) {
      console.log('Load personalized requests error:', error);
      setRequests([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      void loadRequests();
    }, [loadRequests])
  );

  const handleAction = async (
    request: PersonalizedRequest,
    action: 'accept' | 'decline' | 'withdraw' | 'accept_counter' | 'counter',
    counterAmountCents?: number,
    paymentEventId?: string
  ) => {
    setActioningId(request.id);
    try {
      await callEdgeFunction('respond-personalized-autograph-request', {
        request_id: request.id,
        action,
        ...(typeof counterAmountCents === 'number' ? { counter_amount_cents: counterAmountCents } : {}),
        ...(paymentEventId ? { payment_event_id: paymentEventId } : {}),
      });
      setCounterTarget(null);
      setCounterAmount('');
      await loadRequests({ force: true });
    } catch (error) {
      Alert.alert(
        'Request Error',
        error instanceof Error ? error.message : 'Could not update this personalized request.'
      );
    } finally {
      setActioningId(null);
    }
  };

  const handleAcceptCounter = async (request: PersonalizedRequest) => {
    if (!request.counter_amount_cents) {
      Alert.alert('Counter Missing', 'This counter no longer has a valid amount.');
      return;
    }

    setActioningId(request.id);
    try {
      const counterAmount = (request.counter_amount_cents / 100).toFixed(2);

      // Disclosure required before collecting payment details.
      const confirmed = await new Promise<boolean>((resolve) => {
        Alert.alert(
          'Accept Counter Offer',
          `Accepting this counter places a temporary authorization hold of $${counterAmount} on your card. You are only charged when the creator completes and delivers the autograph. Payment is processed by Stripe, Ophinia's authorized payment partner.`,
          [
            { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
            { text: 'Continue', onPress: () => resolve(true) },
          ]
        );
      });
      if (!confirmed) return;

      const paymentData = await callEdgeFunction<{
        client_secret: string;
        payment_intent_id: string;
        payment_event_id: string;
      }>('create-personalized-request-payment-intent', {
        creator_id: request.creator_id,
        recipient_name: request.recipient_name,
        inscription_text: request.inscription_text,
        requester_note: request.requester_note,
        amount_cents: request.counter_amount_cents,
      });

      const { error: initError } = await initPaymentSheet({
        paymentIntentClientSecret: paymentData.client_secret,
        merchantDisplayName: 'Ophinia',
      });

      if (initError) {
        Alert.alert('Authorization Error', 'Could not start payment authorization. Please try again.');
        return;
      }

      const { error: paymentError } = await presentPaymentSheet();
      if (paymentError) {
        if (paymentError.code !== 'Canceled') {
          Alert.alert('Authorization Failed', 'Could not confirm your payment authorization. Please try again.');
        }
        return;
      }

      await handleAction(request, 'accept_counter', undefined, paymentData.payment_event_id);
    } finally {
      setActioningId(null);
    }
  };

  const grouped = useMemo(() => {
    const incoming = requests.filter((request) => request.creator_id === user?.id);
    const outgoing = requests.filter((request) => request.requester_id === user?.id);
    return { incoming, outgoing };
  }, [requests, user?.id]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={BrandColors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={[
          { key: 'incoming', title: 'Requests For You', items: grouped.incoming },
          { key: 'outgoing', title: 'Your Requests', items: grouped.outgoing },
        ]}
        keyExtractor={(item) => item.key}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.eyebrow}>Personalized Requests</Text>
            <Text style={styles.title}>Manage private autograph commissions</Text>
            <Text style={styles.subtitle}>
              Review incoming custom autograph requests, respond to counters, and keep track of private creator commissions.
            </Text>
          </View>
        }
        renderItem={({ item: section }) => (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            {section.items.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyText}>No requests here yet.</Text>
              </View>
            ) : (
              section.items.map((request) => (
                <View key={request.id} style={styles.card}>
                  <Text style={styles.cardTitle}>
                    {request.creator_id === user?.id
                      ? `${request.requester?.display_name ?? 'Collector'} → ${request.recipient_name}`
                      : `${request.creator?.display_name ?? 'Creator'} for ${request.recipient_name}`}
                  </Text>
                  <Text style={styles.cardStatus}>
                    {getStatusLabel(request.status)} · {formatMoney(request.counter_amount_cents ?? request.amount_cents)}
                  </Text>
                  {request.inscription_text ? (
                    <Text style={styles.cardDetail}>Inscription: {request.inscription_text}</Text>
                  ) : null}
                  {request.requester_note ? (
                    <Text style={styles.cardDetail}>Note: {request.requester_note}</Text>
                  ) : null}
                  <Text style={styles.cardMeta}>Created {formatDate(request.created_at)}</Text>
                  <Text style={styles.cardMeta}>Expires {formatDate(request.expires_at)}</Text>
                  {request.status === 'fulfilled' && request.payment_due_at ? (
                    <Text style={styles.cardMeta}>Payment due {formatDate(request.payment_due_at)}</Text>
                  ) : null}

                  <View style={styles.actionsRow}>
                    {request.creator_id === user?.id && request.status === 'pending' ? (
                      <>
                        <Pressable
                          style={[styles.actionButton, actioningId === request.id && styles.disabled]}
                          onPress={() => void handleAction(request, 'accept')}
                          disabled={actioningId === request.id}
                        >
                          <Text style={styles.actionButtonText}>Accept</Text>
                        </Pressable>
                        <Pressable
                          style={[styles.secondaryButton, actioningId === request.id && styles.disabled]}
                          onPress={() => {
                            setCounterTarget(request);
                            setCounterAmount((request.amount_cents / 100).toFixed(2));
                          }}
                          disabled={actioningId === request.id}
                        >
                          <Text style={styles.secondaryButtonText}>Counter</Text>
                        </Pressable>
                        <Pressable
                          style={[styles.ghostButton, actioningId === request.id && styles.disabled]}
                          onPress={() => void handleAction(request, 'decline')}
                          disabled={actioningId === request.id}
                        >
                          <Text style={styles.ghostButtonText}>Decline</Text>
                        </Pressable>
                      </>
                    ) : null}

                    {request.requester_id === user?.id && request.status === 'countered' ? (
                      <>
                        <Pressable
                          style={[styles.actionButton, actioningId === request.id && styles.disabled]}
                          onPress={() => void handleAcceptCounter(request)}
                          disabled={actioningId === request.id}
                        >
                          <Text style={styles.actionButtonText}>Accept Counter</Text>
                        </Pressable>
                        <Pressable
                          style={[styles.ghostButton, actioningId === request.id && styles.disabled]}
                          onPress={() => void handleAction(request, 'withdraw')}
                          disabled={actioningId === request.id}
                        >
                          <Text style={styles.ghostButtonText}>Withdraw</Text>
                        </Pressable>
                      </>
                    ) : null}

                    {request.requester_id === user?.id && request.status === 'pending' ? (
                      <Pressable
                        style={[styles.ghostButton, actioningId === request.id && styles.disabled]}
                        onPress={() => void handleAction(request, 'withdraw')}
                        disabled={actioningId === request.id}
                      >
                        <Text style={styles.ghostButtonText}>Withdraw</Text>
                      </Pressable>
                    ) : null}

                    {request.requester_id === user?.id && request.status === 'fulfilled' && !request.completed_transfer_id ? (
                      <Pressable
                        style={styles.actionButton}
                        onPress={async () => {
                          try {
                            await openAuthenticatedWebPath(`/app/personalized-requests/${request.id}/checkout`);
                          } catch {
                            Alert.alert('Checkout Error', 'Could not open personalized checkout. Please try again.');
                          }
                        }}
                      >
                        <Text style={styles.actionButtonText}>Complete Payment</Text>
                      </Pressable>
                    ) : null}

                    {request.creator_id === user?.id && request.status === 'accepted' ? (
                      <Pressable
                        style={styles.secondaryButton}
                        onPress={() => router.push({ pathname: '/capture', params: { personalized_request_id: request.id } })}
                      >
                        <Text style={styles.secondaryButtonText}>Create Autograph</Text>
                      </Pressable>
                    ) : null}
                  </View>
                </View>
              ))
            )}
          </View>
        )}
      />

      <Modal visible={!!counterTarget} transparent animationType="slide" onRequestClose={() => setCounterTarget(null)}>
        <Pressable style={styles.modalOverlay} onPress={() => setCounterTarget(null)}>
          <View style={styles.modalSheet} onStartShouldSetResponder={() => true}>
            <Text style={styles.modalTitle}>Counter Personalized Request</Text>
            <Text style={styles.modalSubtitle}>
              Set a new price for {counterTarget?.recipient_name ?? 'this request'}.
            </Text>
            <TextInput
              style={styles.modalInput}
              value={counterAmount}
              onChangeText={(value) => setCounterAmount(formatCurrencyInput(value))}
              keyboardType="decimal-pad"
              placeholder="Counter amount in USD"
              placeholderTextColor="#999"
            />
            <Pressable
              style={styles.actionButton}
              onPress={() => {
                const amount = Number.parseFloat(counterAmount);
                if (!counterTarget || Number.isNaN(amount) || amount <= 0) {
                  Alert.alert('Invalid Counter', 'Enter a valid counter amount greater than $0.');
                  return;
                }
                void handleAction(counterTarget, 'counter', Math.round(amount * 100));
              }}
            >
              <Text style={styles.actionButtonText}>Send Counter</Text>
            </Pressable>
            <Pressable style={styles.ghostButton} onPress={() => setCounterTarget(null)}>
              <Text style={styles.ghostButtonText}>Cancel</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

function getStatusLabel(status: PersonalizedRequest['status']) {
  switch (status) {
    case 'pending': return 'Pending';
    case 'countered': return 'Countered';
    case 'accepted': return 'Accepted';
    case 'declined': return 'Declined';
    case 'withdrawn': return 'Withdrawn';
    case 'expired': return 'Expired';
    case 'fulfilled': return 'Fulfilled';
    case 'completed': return 'Completed';
    default: return status;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BrandColors.background,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: BrandColors.background,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 8,
  },
  eyebrow: {
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    color: BrandColors.primary,
    fontFamily: BrandFonts.primary,
    fontWeight: '700',
  },
  title: {
    marginTop: 8,
    fontSize: 28,
    color: '#111',
    fontFamily: BrandFonts.primary,
    fontWeight: '800',
  },
  subtitle: {
    marginTop: 8,
    fontSize: 15,
    lineHeight: 22,
    color: '#666',
    fontFamily: BrandFonts.primary,
  },
  section: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 6,
  },
  sectionTitle: {
    fontSize: 18,
    color: '#111',
    fontFamily: BrandFonts.primary,
    fontWeight: '700',
    marginBottom: 10,
  },
  emptyCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 18,
  },
  emptyText: {
    color: '#777',
    fontSize: 14,
    fontFamily: BrandFonts.primary,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 16,
    color: '#111',
    fontWeight: '700',
    fontFamily: BrandFonts.primary,
  },
  cardStatus: {
    marginTop: 6,
    fontSize: 14,
    color: BrandColors.primary,
    fontFamily: BrandFonts.primary,
    fontWeight: '700',
  },
  cardDetail: {
    marginTop: 8,
    fontSize: 14,
    color: '#444',
    lineHeight: 20,
    fontFamily: BrandFonts.primary,
  },
  cardMeta: {
    marginTop: 6,
    fontSize: 12,
    color: '#777',
    fontFamily: BrandFonts.primary,
  },
  actionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 14,
  },
  actionButton: {
    backgroundColor: BrandColors.primary,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    fontFamily: BrandFonts.primary,
  },
  secondaryButton: {
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    backgroundColor: '#f4f4f6',
  },
  secondaryButtonText: {
    color: '#111',
    fontSize: 14,
    fontWeight: '700',
    fontFamily: BrandFonts.primary,
  },
  ghostButton: {
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  ghostButtonText: {
    color: '#444',
    fontSize: 14,
    fontWeight: '600',
    fontFamily: BrandFonts.primary,
  },
  disabled: {
    opacity: 0.5,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    padding: 20,
  },
  modalSheet: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 20,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111',
    fontFamily: BrandFonts.primary,
  },
  modalSubtitle: {
    marginTop: 8,
    fontSize: 13,
    color: '#666',
    fontFamily: BrandFonts.primary,
  },
  modalInput: {
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 16,
    color: '#111',
    fontFamily: BrandFonts.primary,
  },
});
