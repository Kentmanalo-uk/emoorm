import { useCallback, useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView, Platform, RefreshControl, ScrollView, StyleSheet, View,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import apiClient from '../../src/api/client';
import { toast } from '../../src/lib/toast';
import { t } from '../../src/theme';
import SellerPage, { sellerPageStyles } from '../../src/components/seller/SellerPage';
import SellerChips from '../../src/components/seller/SellerChips';
import Sheet, { SheetOption } from '../../src/components/Sheet';
import {
  PHONE_QUICK_TABS, ReturnRow, ReturnsEmpty, TABS,
} from '../../src/components/seller/returns/ReturnBits';
import ReturnDetail from '../../src/components/seller/returns/ReturnDetail';
import { PageLoader } from '../../src/components/BrandLoader';

/*
 * /seller/returns: Returns & refunds (web/src/pages/SellerReturns.jsx +
 * SellerReturns.css at phone size). "All" and "To review" chips with the
 * other stages behind More; the requests; the chosen one opens above the
 * list (the website's phone layout puts the detail first) with what the
 * seller can do at its stage. A return notification opens one directly:
 * /seller/returns?id=<returnId>.
 */
export default function SellerReturnsScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams();
  const scrollRef = useRef(null);
  const [returns, setReturns] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState('all');
  const [selected, setSelected] = useState(null);
  const [note, setNote] = useState('');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('GCASH');
  const [reference, setReference] = useState('');
  const [physical, setPhysical] = useState(true);
  const [busy, setBusy] = useState(false);
  const [stagesOpen, setStagesOpen] = useState(false);

  const load = useCallback(() => apiClient.get('/returns/store', { params: { pageSize: 50 } })
    .then((res) => setReturns(res.data || []))
    .catch((err) => toast.error(err.message || 'Unable to load returns'))
    .finally(() => setLoaded(true)), []);
  useEffect(() => { load(); }, [load]);

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const choose = (item) => {
    setSelected(item);
    setAmount(String(item.requestedAmount || ''));
    setNote(item.sellerNote || '');
    // The detail opens above the list: bring it into view.
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  };

  // Deep link from a return notification: /seller/returns?id=<returnId>.
  const openedId = useRef(null);
  const targetId = typeof params.id === 'string' ? params.id : null;
  useEffect(() => {
    if (!targetId || returns.length === 0 || openedId.current === targetId) return;
    openedId.current = targetId;
    const match = returns.find((item) => item.id === targetId);
    if (match) choose(match);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [returns, targetId]);

  const call = async (path, body, message) => {
    setBusy(true);
    try {
      await apiClient.patch(`/returns/${selected.id}/${path}`, body);
      toast.success(message);
      setSelected(null);
      await load();
    } catch (err) {
      toast.error(err.message || 'Action failed');
    } finally {
      setBusy(false);
    }
  };
  const decide = (action) => {
    if (action === 'REJECT' && !note.trim()) {
      toast.error('Add a rejection note');
      return;
    }
    call('decision', { action, approvedAmount: Number(amount), requiresPhysicalReturn: physical, sellerNote: note }, action === 'APPROVE' ? 'Return approved' : 'Return rejected');
  };

  const visible = tab === 'all' ? returns : returns.filter((r) => r.status === tab);
  const countFor = (key) => (key === 'all' ? returns.length : returns.filter((r) => r.status === key).length);
  const tabLabel = (key) => TABS.find(([k]) => k === key)?.[1];
  const quick = PHONE_QUICK_TABS.includes(tab);

  return (
    <SellerPage scroll={false}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false}
          ref={scrollRef}
          style={styles.flex}
          contentContainerStyle={[sellerPageStyles.content, { paddingBottom: 24 + insets.bottom }, loaded && !visible.length && !selected && styles.grow]}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} colors={[t.primary[600]]} tintColor={t.primary[600]} />}
        >
          <SellerChips
            chips={PHONE_QUICK_TABS.map((key) => ({
              key,
              label: `${key === 'REQUESTED' ? 'To review' : tabLabel(key)}${countFor(key) > 0 ? ` · ${countFor(key)}` : ''}`,
            }))}
            active={tab}
            onChange={setTab}
            more={{ label: quick ? 'More' : tabLabel(tab), on: !quick, onPress: () => setStagesOpen(true) }}
          />

          <View style={[styles.layout, loaded && !visible.length && !selected && styles.grow]}>
            {selected ? (
              <ReturnDetail
                selected={selected}
                amount={amount}
                setAmount={setAmount}
                note={note}
                setNote={setNote}
                method={method}
                setMethod={setMethod}
                reference={reference}
                setReference={setReference}
                physical={physical}
                setPhysical={setPhysical}
                busy={busy}
                onDecide={decide}
                onReceived={() => call('received', {}, 'Return marked received')}
                onRefund={() => call('refund', { refundMethod: method, refundedAmount: Number(amount), refundReference: reference }, 'Refund recorded')}
              />
            ) : null}

            {!loaded ? (
              <View style={styles.list}>
                <PageLoader label="Loading returns" />
              </View>
            ) : (
              <View style={[styles.list, loaded && !visible.length && !selected && styles.grow]}>
                {visible.map((item) => (
                  <ReturnRow key={item.id} item={item} selected={selected?.id === item.id} onPress={() => choose(item)} />
                ))}
                {!visible.length ? <ReturnsEmpty all={tab === 'all'} /> : null}
              </View>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <Sheet variant="seller" open={stagesOpen} title="Show returns" onClose={() => setStagesOpen(false)}>
        {TABS.map(([key, label]) => (
          <SheetOption
            key={key}
            variant="seller"
            label={`${label}${countFor(key) > 0 ? ` (${countFor(key)})` : ''}`}
            selected={tab === key}
            onPress={() => { setTab(key); setStagesOpen(false); }}
          />
        ))}
      </Sheet>
    </SellerPage>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  // .seller-return-layout / .seller-return-list on phones
  layout: { gap: 12, marginTop: 12 },
  list: { gap: 10 },
  // Nothing to show: the empty state takes the rest of the screen and centres in it.
  grow: { flexGrow: 1 },
});
