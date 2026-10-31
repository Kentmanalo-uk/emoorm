import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import {
  ArrowLeftIcon, ArrowRightIcon, ArrowUpIcon, ArrowUpLeftIcon, ArrowUpRightIcon, ArrowUUpLeftIcon, ArrowsClockwiseIcon,
  CaretDownIcon, ClockIcon, CrosshairIcon, FlagCheckeredIcon, ListBulletsIcon, MapPinIcon, NavigationArrowIcon, PathIcon,
} from '../../lib/icons';
import { font, t, themed } from '../../theme';
import LeafletMap from './LeafletMap';
import {
  getMyLocation, haversine, km, locationAllowed, mins, validPin,
} from './mapUtils';

/*
 * Checkout, pickup: where the shop is, and how to get there from here
 * (web/src/components/maps/PickupRoute.jsx + .css).
 *
 * The shop's pin on a map; with the buyer's location (asked for only when
 * they tap, or used at once when they already allowed it), the road route
 * between the two, its distance and travel time, a turn-by-turn road guide,
 * and a button that opens the same trip in Google Maps.
 *
 * The route comes from OSRM's public router (OpenStreetMap roads, by car,
 * which is close to a tricycle or motorbike here). If it cannot be reached,
 * the straight-line distance stands in, marked as such.
 */

const OSRM = 'https://router.project-osrm.org/route/v1/driving';

// One step of the road guide, in plain words.
const stepText = (step, shopName) => {
  const { type, modifier, exit } = step.maneuver || {};
  const road = step.name ? step.name : 'the road';
  const onto = step.name ? ` onto ${step.name}` : '';
  const turn = modifier ? modifier.replace('uturn', 'U-turn') : '';
  switch (type) {
    case 'depart': return step.name ? `Start on ${step.name}` : 'Head out from where you are';
    case 'arrive': return `Arrive at ${shopName}`;
    case 'turn': return `Turn ${turn}${onto}`;
    case 'new name': return `Continue onto ${road}`;
    case 'continue': return modifier && modifier !== 'straight' ? `Keep ${turn} on ${road}` : `Continue on ${road}`;
    case 'merge': return `Merge onto ${road}`;
    case 'fork': return `Keep ${turn || 'ahead'} at the fork onto ${road}`;
    case 'end of road': return `At the end of the road, turn ${turn} onto ${road}`;
    case 'roundabout':
    case 'rotary': return `At the roundabout, take exit ${exit || 1} onto ${road}`;
    case 'on ramp':
    case 'off ramp': return `Take the ramp onto ${road}`;
    default: return modifier ? `Go ${turn} onto ${road}` : `Continue on ${road}`;
  }
};

function StepIcon({ step }) {
  const { type, modifier = '' } = step.maneuver || {};
  const props = { size: 16, weight: 'bold', color: t.primary[700] };
  if (type === 'depart') return <NavigationArrowIcon {...props} weight="fill" />;
  if (type === 'arrive') return <FlagCheckeredIcon {...props} />;
  if (type === 'roundabout' || type === 'rotary') return <ArrowsClockwiseIcon {...props} />;
  if (modifier.includes('uturn')) return <ArrowUUpLeftIcon {...props} />;
  if (modifier === 'slight left') return <ArrowUpLeftIcon {...props} />;
  if (modifier === 'slight right') return <ArrowUpRightIcon {...props} />;
  if (modifier.includes('left')) return <ArrowLeftIcon {...props} />;
  if (modifier.includes('right')) return <ArrowRightIcon {...props} />;
  return <ArrowUpIcon {...props} />;
}

const open = (url) => Linking.openURL(url).catch(() => {});

export default function PickupRoute({ store, style }) {
  const shop = useMemo(
    () => (validPin(store?.latitude, store?.longitude) ? [Number(store.latitude), Number(store.longitude)] : null),
    [store?.latitude, store?.longitude],
  );
  const [me, setMe] = useState(null);
  const [locStatus, setLocStatus] = useState('idle'); // idle | asking | denied | unavailable | ok
  const [route, setRoute] = useState(null); // { line, distance, duration, steps, byRoad }
  const [routing, setRouting] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const live = useRef(true);
  useEffect(() => () => { live.current = false; }, []);

  const locate = useCallback(async () => {
    setLocStatus('asking');
    try {
      const pos = await getMyLocation();
      if (!live.current) return;
      setMe([pos.latitude, pos.longitude]);
      setLocStatus('ok');
    } catch (err) {
      if (live.current) setLocStatus(err.code === 'denied' ? 'denied' : 'unavailable');
    }
  }, []);

  // Already allowed on this phone: no need to ask, show the way at once.
  useEffect(() => {
    if (!shop) return undefined;
    let on = true;
    locationAllowed().then((ok) => { if (on && ok) locate(); });
    return () => { on = false; };
  }, [shop, locate]);

  // The road route once both ends are known.
  useEffect(() => {
    if (!shop || !me) return undefined;
    const ctrl = new AbortController();
    let cancelled = false;
    const timer = setTimeout(() => ctrl.abort(), 9000);
    const straight = () => ({
      line: [me, shop],
      distance: haversine(me, shop),
      // About 25 km/h door to door on provincial roads.
      duration: (haversine(me, shop) * 1.3) / (25000 / 3600),
      steps: [],
      byRoad: false,
    });
    setRouting(true);
    fetch(`${OSRM}/${me[1]},${me[0]};${shop[1]},${shop[0]}?overview=full&geometries=geojson&steps=true`, { signal: ctrl.signal })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('route'))))
      .then((data) => {
        const r = data?.routes?.[0];
        if (!r) throw new Error('no route');
        if (cancelled) return;
        setRoute({
          line: r.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
          distance: r.distance,
          duration: r.duration,
          steps: (r.legs?.[0]?.steps || []).filter((s) => s.maneuver),
          byRoad: true,
        });
      })
      // Too slow (9 s) or unreachable: the straight line stands in.
      .catch(() => { if (!cancelled) setRoute(straight()); })
      .finally(() => { clearTimeout(timer); if (!cancelled) setRouting(false); });
    return () => { cancelled = true; clearTimeout(timer); ctrl.abort(); };
  }, [shop, me]);

  const place = [store?.pickupAddress, store?.municipality?.name, 'Oriental Mindoro'].filter(Boolean).join(', ');
  const mapsUrl = shop
    ? `https://www.google.com/maps/dir/?api=1${me ? `&origin=${me[0]},${me[1]}` : ''}&destination=${shop[0]},${shop[1]}&travelmode=driving`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place)}`;

  if (!shop) {
    return (
      <View style={[styles.pr, styles.noPin, style]}>
        <MapPinIcon size={18} weight="fill" color={t.accent[500]} style={styles.noPinIcon} />
        <View style={styles.noPinBody}>
          <Text style={styles.noPinText}>The shop hasn&apos;t pinned its pickup spot on the map yet.</Text>
          <Text accessibilityRole="link" onPress={() => open(mapsUrl)} style={styles.link}>Find the address in Google Maps</Text>
        </View>
      </View>
    );
  }

  const points = route ? [shop, me, ...route.line] : me ? [shop, me] : [shop];
  const steps = route?.steps || [];

  return (
    <View style={[styles.pr, style]}>
      <LeafletMap
        height={230}
        style={styles.map}
        shop={{ latitude: shop[0], longitude: shop[1], name: store.name, logo: store.logo }}
        me={me}
        route={route ? { line: route.line, byRoad: route.byRoad } : null}
        fitPoints={points}
      />

      {route ? (
        <View style={styles.summary}>
          <View style={styles.stat}>
            <PathIcon size={18} weight="bold" color={t.primary[600]} />
            <Text style={styles.statText}>{km(route.distance)}</Text>
          </View>
          <View style={styles.stat}>
            <ClockIcon size={18} weight="bold" color={t.primary[600]} />
            <Text style={styles.statText}>about {mins(route.duration)}</Text>
          </View>
          <Text style={styles.note}>{route.byRoad ? 'by road, from where you are now' : 'in a straight line (road route unavailable)'}</Text>
        </View>
      ) : (
        <View style={styles.summary}>
          {locStatus === 'denied' ? (
            <Text style={styles.note}>
              Location is off for E-MOORM. Allow it in your phone settings to see the way from where you are.
              {' '}
              <Text accessibilityRole="link" onPress={() => Linking.openSettings().catch(() => {})} style={styles.noteLink}>Open settings</Text>
            </Text>
          ) : locStatus === 'unavailable' ? (
            <Text style={styles.note}>We couldn&apos;t find where you are. The shop&apos;s spot is on the map.</Text>
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: locStatus === 'asking' || routing }}
              disabled={locStatus === 'asking' || routing}
              onPress={locate}
              style={[styles.locate, (locStatus === 'asking' || routing) && styles.locateBusy]}
            >
              {locStatus === 'asking' ? <ActivityIndicator size={14} color={t.primary[700]} /> : <CrosshairIcon size={17} weight="bold" color={t.primary[700]} />}
              <Text style={styles.locateText}>{locStatus === 'asking' ? 'Finding you…' : 'Show the way from my location'}</Text>
            </Pressable>
          )}
        </View>
      )}
      {routing ? <Text style={[styles.note, styles.routing]}>Finding the road route…</Text> : null}

      <View style={styles.actions}>
        <Pressable accessibilityRole="link" onPress={() => open(mapsUrl)} style={[styles.btn, styles.btnPrimary]}>
          <NavigationArrowIcon size={16} weight="fill" color="#fff" />
          <Text style={[styles.btnText, styles.btnTextPrimary]}>Open in Google Maps</Text>
        </Pressable>
        {steps.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: guideOpen }}
            onPress={() => setGuideOpen((v) => !v)}
            style={styles.btn}
          >
            <ListBulletsIcon size={16} color={t.neutral[700]} />
            <Text style={styles.btnText}>Road guide ({steps.length} steps)</Text>
            <CaretDownIcon size={14} color={t.neutral[700]} style={guideOpen && styles.caretOpen} />
          </Pressable>
        ) : null}
      </View>

      {guideOpen && steps.length > 0 ? (
        <ScrollView showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false} style={styles.steps} contentContainerStyle={styles.stepsContent} nestedScrollEnabled>
          {steps.map((step, i) => (
            // eslint-disable-next-line react/no-array-index-key
            <View key={i} style={styles.step}>
              <View style={styles.stepIcon}><StepIcon step={step} /></View>
              <Text style={styles.stepText}>{stepText(step, store.name)}</Text>
              {step.distance > 0 ? <Text style={styles.stepDist}>{km(step.distance)}</Text> : null}
            </View>
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  pr: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: t.neutral[150],
    borderRadius: 14,
    backgroundColor: t.neutral[0],
    overflow: 'hidden',
  },
  map: { borderRadius: 0, backgroundColor: t.neutral[100] },
  summary: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', rowGap: 8, columnGap: 16, paddingTop: 12, paddingHorizontal: 14, paddingBottom: 4 },
  stat: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statText: { fontSize: 15, lineHeight: 22, color: t.neutral[900], ...font(500) },
  note: { fontSize: 12.5, lineHeight: 17.5, color: t.neutral[500], ...font(400) },
  noteLink: { color: t.primary[700], ...font(500) },
  routing: { paddingHorizontal: 14 },
  locate: {
    flexDirection: 'row', alignItems: 'center', gap: 8, height: 38, paddingHorizontal: 14, borderRadius: 10, backgroundColor: t.primary[50],
  },
  locateBusy: { opacity: 0.6 },
  locateText: { fontSize: 14, lineHeight: 18, color: t.primary[700], ...font(500) },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingTop: 10, paddingHorizontal: 14, paddingBottom: 14 },
  btn: {
    flexDirection: 'row', alignItems: 'center', gap: 7, height: 36, paddingHorizontal: 13,
    borderWidth: 1, borderColor: t.neutral[200], borderRadius: 999, backgroundColor: t.neutral[0],
  },
  btnPrimary: { borderColor: t.primary[600], backgroundColor: t.primary[600] },
  btnText: { fontSize: 13.5, lineHeight: 17, color: t.neutral[700], ...font(500) },
  btnTextPrimary: { color: t.onBrand },
  caretOpen: { transform: [{ rotate: '180deg' }] },
  steps: { maxHeight: 300 },
  stepsContent: { paddingHorizontal: 14, paddingBottom: 14 },
  step: {
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderTopWidth: 1, borderTopColor: t.neutral[100],
  },
  stepIcon: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: t.primary[50] },
  stepText: { flex: 1, minWidth: 0, fontSize: 13.5, lineHeight: 20, color: t.neutral[800], ...font(400) },
  stepDist: { flexShrink: 0, fontSize: 12.5, lineHeight: 18, color: t.neutral[500], ...font(400) },
  noPin: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 12, paddingHorizontal: 14 },
  noPinIcon: { marginTop: 2 },
  noPinBody: { flex: 1, minWidth: 0 },
  noPinText: { marginBottom: 4, fontSize: 13.5, lineHeight: 20, color: t.neutral[600], ...font(400) },
  link: { alignSelf: 'flex-start', fontSize: 13.5, lineHeight: 20, color: t.primary[700], ...font(500) },
}));
