import { Link } from 'react-router-dom';
import { TOOL_SECTIONS } from '../components/seller/sellerTools';
import useShortcutLook from '../hooks/useShortcutLook';

/**
 * /seller/tools: every tool in the Seller Center, grouped.
 *
 * Home shows the eight a seller opens most days; "All tools" beside its Shop
 * tools comes here for the rest. Same mark, same label, same four-across
 * grid, so a tool looks the same wherever it is met -- this page is Home's
 * tools section repeated under headings. The list lives in sellerTools.js,
 * which Home picks its eight out of.
 */
export default function SellerTools() {
  const look = useShortcutLook();
  return (
    <div className="seller-dashboard sh">
      {TOOL_SECTIONS.map((section) => (
        <section className="sh-card" key={section.key}>
          <div className="sh-card-head"><h2>{section.title}</h2></div>
          <div className="sh-tools">
            {section.tools.map(({
              key, to, label, Art, tone,
            }) => (
              <Link key={key} to={to} className="sh-tool">
                <span className="sh-tool-icon"><Art size={36} tone={tone} glass look={look} /></span>
                <span>{label}</span>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
