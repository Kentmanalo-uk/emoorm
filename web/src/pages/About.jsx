import { Link } from 'react-router-dom';
import useSeo from '../lib/seo';
import { ArrowRight } from '../lib/icons';
import Layout from '../components/layout/Layout';
import { useMunicipalities } from '../hooks/useReferenceData';
import StepArt from '../components/about/StepArt';
import './About.css';

/*
 * About Emoorm. Its centre is the province itself: the hero is the fifteen
 * towns of Oriental Mindoro set as one wall of type on the brand green, each
 * a link to its town's page. After it, each section has a form of its own:
 * the mission as one large sentence, how buying works as a line of words,
 * what you can do as a dark index, the team as their names, and one closing
 * line. No cards, no icon tiles.
 *
 * Class names start with "ab-" so the phone layer's flattening of
 * ".about-hero", ".about-feature"… (styles/phone-app.css) leaves them alone.
 */

/* Until the live list answers (and the order it is shown in). */
const TOWNS = [
  'Baco', 'Bansud', 'Bongabong', 'Bulalacao', 'Calapan City', 'Gloria', 'Mansalay', 'Naujan',
  'Pinamalayan', 'Pola', 'Puerto Galera', 'Roxas', 'San Teodoro', 'Socorro', 'Victoria',
];
const CAPITAL = /calapan/i;

const FLOW = [
  { art: 'find', word: 'Find', text: 'Search, pick a category, or open a town.' },
  { art: 'order', word: 'Order', text: 'Delivery or pickup, from the seller you choose.' },
  { art: 'pay', word: 'Pay the seller', text: 'Cash on delivery, GCash or QR Ph. Emoorm never holds it.' },
  { art: 'receive', word: 'Receive', text: 'Updates as it is confirmed, packed and handed over.' },
];

const CAN_DO = [
  ['Buy from the source', 'Every shop is run by a local seller who manages their own listings, stock and orders.'],
  ['Trust who you buy from', 'Sellers and new listings are checked by a municipal or platform administrator first.'],
  ['Get it delivered, or pick it up', 'Sellers choose the barangays they deliver to, or offer pickup, or both.'],
  ['Check out safely', 'Buyers verify once with a valid Philippine ID. The photo is read, never stored.'],
  ['Talk to sellers', 'Ask about a product or an order, and reach your town’s administrator for help.'],
  ['Return what is wrong', 'Damaged, wrong or incomplete items can be returned; rate what you bought.'],
  ['Find sellers near you', 'On the store map, or search with a photo of what you want.'],
  ['Shop in your language', 'English, Tagalog or Bisaya, whichever you are most at home in.'],
];

const TEAM = [
  { name: 'Mike Fernandez', role: 'Developer' },
  { name: 'Kent Manalo', role: 'Developer' },
  { name: 'John Paul Quisto', role: 'Developer' },
];

const About = () => {
  useSeo({
    title: 'About E-MOORM',
    description: 'E-MOORM is a hyperlocal marketplace connecting buyers and sellers '
      + 'across Oriental Mindoro, Philippines.',
    path: '/about',
  });

  // The towns with their pages once the list is in (often already in the page).
  const { municipalities } = useMunicipalities();
  const towns = municipalities.length
    ? [...municipalities].sort((a, b) => a.name.localeCompare(b.name)).map((m) => ({ name: m.name, to: `/municipality/${m.id}` }))
    : TOWNS.map((name) => ({ name, to: null }));

  return (
    <Layout>
      <div className="ab">
        {/* The province, town by town. */}
        <section className="ab-hero">
          <div className="ab-wrap">
            <h1 className="ab-title" data-bar-title="About Emoorm">
              One market for <span>all of Oriental Mindoro.</span>
            </h1>
            <p className="ab-lead">
              Emoorm brings the farmers, fisherfolk, cooks and makers of every town online, so what the province
              grows, catches and makes reaches buyers in every other.
            </p>
          </div>
          <ul className="ab-towns" aria-label={`The ${towns.length} towns Emoorm serves`}>
            {towns.map((t, i) => {
              const cls = `ab-town${CAPITAL.test(t.name) ? ' is-capital' : i % 2 ? ' is-outline' : ''}`;
              return (
                <li key={t.name}>
                  {t.to ? <Link to={t.to} className={cls}>{t.name}</Link> : <span className={cls}>{t.name}</span>}
                </li>
              );
            })}
          </ul>
        </section>

        {/* Why it exists, said once and large. */}
        <section className="ab-mission">
          <div className="ab-wrap ab-mission-grid">
            <p className="ab-quote">
              Market days, word of mouth and long rides between towns used to decide who a seller could reach.
              <span> Now a shop is a phone away.</span>
            </p>
            <div className="ab-mission-text">
              <p>
                Emoorm gives every local producer a store they run themselves, and gives buyers one place to find
                and order what is made and grown in the province.
              </p>
              <p>
                Buyers pay the seller directly, by cash on delivery, GCash or QR Ph. Emoorm takes no commission and
                never holds the money.
              </p>
              <Link to="/sell" className="ab-link">Open a shop <ArrowRight size={16} /></Link>
            </div>
          </div>
        </section>

        {/* How buying works, as one line of words. */}
        <section className="ab-flow" id="how-it-works">
          <div className="ab-wrap">
            <h2 className="ab-h2">How buying works</h2>
            <ol className="ab-flow-line">
              {FLOW.map((step, i) => (
                <li key={step.word}>
                  <StepArt kind={step.art} className="ab-flow-art" />
                  <span className="ab-flow-word">{step.word}{i < FLOW.length - 1 && <ArrowRight size={28} className="ab-flow-arrow" aria-hidden="true" />}</span>
                  <span className="ab-flow-text">{step.text}</span>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* What you can do: an index on dark. */}
        <section className="ab-index">
          <div className="ab-wrap">
            <h2 className="ab-h2">What you can do here</h2>
            <dl className="ab-index-list">
              {CAN_DO.map(([title, text]) => (
                <div key={title}>
                  <dt>{title}</dt>
                  <dd>{text}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* Who made it. */}
        <section className="ab-team">
          <div className="ab-wrap ab-team-grid">
            <div>
              <h2 className="ab-h2">Made in Mindoro.</h2>
              <p className="ab-team-note">
                Emoorm was built by Bachelor of Science in Information Technology students of Mindoro State
                University, under the guidance of Prof. Christian Cabrera.
              </p>
            </div>
            <ul className="ab-names">
              {TEAM.map((p) => (
                <li key={p.name}><strong>{p.name}</strong><span>{p.role} · BSIT 4th year</span></li>
              ))}
              <li className="is-adviser"><strong>Christian Cabrera</strong><span>Project adviser · Professor</span></li>
            </ul>
          </div>
        </section>

        <section className="ab-close">
          <div className="ab-wrap">
            <Link to="/help" className="ab-close-link">
              Questions or feedback? <span>Talk to us <ArrowRight size={28} /></span>
            </Link>
          </div>
        </section>
      </div>
    </Layout>
  );
};

export default About;
