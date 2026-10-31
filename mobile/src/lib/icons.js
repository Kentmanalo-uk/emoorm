import { createIkion } from './ikionNative';

/*
 * The app's icons: Ikions (ikions.cloud, @ikions/react, as on the website),
 * under the names the screens already used (they came from Phosphor) and
 * with Phosphor's props:
 *
 *   <StorefrontIcon size={18} weight="fill" color={t.primary[600]} />
 *
 *   size 24, color '#000' (as Phosphor's defaults), weight: 'fill' draws
 *   Ikions' filled icon; 'thin' | 'light' | 'regular' | 'bold' its outline,
 *   thinner to heavier. mirrored, style, and any react-native-svg prop.
 *
 * Each icon keeps its drawing (Icon.ikion) for ikionShapes() in
 * ./ikionNative, which places it inside another <Svg> (gradient fills).
 * Brand logos have no Ikions drawing, so those stay Phosphor's. Generated
 * from the website's mapping (web/src/lib/icons.jsx).
 */
import ArchiveIk from '@ikions/react/icons/archive';
import ArrowDownIk from '@ikions/react/icons/arrow-down';
import ArrowLeftIk from '@ikions/react/icons/arrow-left';
import ArrowRightIk from '@ikions/react/icons/arrow-right';
import ArrowUpIk from '@ikions/react/icons/arrow-up';
import ArrowUpLeftIk from '@ikions/react/icons/arrow-up-left';
import ArrowUpRightIk from '@ikions/react/icons/arrow-up-right';
import BagIk from '@ikions/react/icons/bag';
import BalanceScaleIk from '@ikions/react/icons/balance-scale';
import BanIk from '@ikions/react/icons/ban';
import BarChartIk from '@ikions/react/icons/bar-chart';
import BarcodeIk from '@ikions/react/icons/barcode';
import BasketIk from '@ikions/react/icons/basket';
import BellIk from '@ikions/react/icons/bell';
import BellOffIk from '@ikions/react/icons/bell-off';
import BellRingIk from '@ikions/react/icons/bell-ring';
import BottleIk from '@ikions/react/icons/bottle';
import BreadIk from '@ikions/react/icons/bread';
import BriefcaseIk from '@ikions/react/icons/briefcase';
import BrushIk from '@ikions/react/icons/brush';
import CalculatorIk from '@ikions/react/icons/calculator';
import CalendarCheckIk from '@ikions/react/icons/calendar-check';
import CalendarIk from '@ikions/react/icons/calendar';
import CalendarPlusIk from '@ikions/react/icons/calendar-plus';
import CameraIk from '@ikions/react/icons/camera';
import CarrotIk from '@ikions/react/icons/carrot';
import CartIk from '@ikions/react/icons/cart';
import ChatDotsIk from '@ikions/react/icons/chat-dots';
import ChatsIk from '@ikions/react/icons/chats';
import CheckIk from '@ikions/react/icons/check';
import ChevronDownIk from '@ikions/react/icons/chevron-down';
import ChevronLeftIk from '@ikions/react/icons/chevron-left';
import ChevronRightIk from '@ikions/react/icons/chevron-right';
import ChevronUpIk from '@ikions/react/icons/chevron-up';
import CirclePlayIk from '@ikions/react/icons/circle-play';
import CirclePlusIk from '@ikions/react/icons/circle-plus';
import CityIk from '@ikions/react/icons/city';
import ClipboardListIk from '@ikions/react/icons/clipboard-list';
import ClockIk from '@ikions/react/icons/clock';
import CloseIk from '@ikions/react/icons/close';
import CoffeeIk from '@ikions/react/icons/coffee';
import CoinsIk from '@ikions/react/icons/coins';
import CommentTextIk from '@ikions/react/icons/comment-text';
import CookieIk from '@ikions/react/icons/cookie';
import CookingPotIk from '@ikions/react/icons/cooking-pot';
import CopyIk from '@ikions/react/icons/copy';
import CreditCardIk from '@ikions/react/icons/credit-card';
import CrosshairIk from '@ikions/react/icons/crosshair';
import CubeIk from '@ikions/react/icons/cube';
import DatabaseIk from '@ikions/react/icons/database';
import DeployRocketIk from '@ikions/react/icons/deploy-rocket';
import DesktopIk from '@ikions/react/icons/desktop';
import DownloadIk from '@ikions/react/icons/download';
import DropletIk from '@ikions/react/icons/droplet';
import EditIk from '@ikions/react/icons/edit';
import EggIk from '@ikions/react/icons/egg';
import ErrorIk from '@ikions/react/icons/error';
import ExternalLinkIk from '@ikions/react/icons/external-link';
import EyeIk from '@ikions/react/icons/eye';
import EyeOffIk from '@ikions/react/icons/eye-off';
import FileDownloadIk from '@ikions/react/icons/file-download';
import FileTextIk from '@ikions/react/icons/file-text';
import FilterIk from '@ikions/react/icons/filter';
import FinishFlagIk from '@ikions/react/icons/finish-flag';
import FishIk from '@ikions/react/icons/fish';
import FlagIk from '@ikions/react/icons/flag';
import FlowerIk from '@ikions/react/icons/flower';
import GiftIk from '@ikions/react/icons/gift';
import GlobeIk from '@ikions/react/icons/globe';
import GraduationCapIk from '@ikions/react/icons/graduation-cap';
import GridIk from '@ikions/react/icons/grid';
import HandshakeIk from '@ikions/react/icons/handshake';
import HeadsetIk from '@ikions/react/icons/headset';
import HeartIk from '@ikions/react/icons/heart';
import HeartPulseIk from '@ikions/react/icons/heart-pulse';
import HelpIk from '@ikions/react/icons/help';
import HistoryIk from '@ikions/react/icons/history';
import HomeIk from '@ikions/react/icons/home';
import IdCardIk from '@ikions/react/icons/id-card';
import ImageIk from '@ikions/react/icons/image';
import ImagesIk from '@ikions/react/icons/images';
import InboxIk from '@ikions/react/icons/inbox';
import InfoIk from '@ikions/react/icons/info';
import KeyIk from '@ikions/react/icons/key';
import LaptopIk from '@ikions/react/icons/laptop';
import LayoutGridIk from '@ikions/react/icons/layout-grid';
import LightbulbIk from '@ikions/react/icons/lightbulb';
import LineChartIk from '@ikions/react/icons/line-chart';
import LinkIk from '@ikions/react/icons/link';
import ListIk from '@ikions/react/icons/list';
import LoaderIk from '@ikions/react/icons/loader';
import LockIk from '@ikions/react/icons/lock';
import LogOutIk from '@ikions/react/icons/log-out';
import MailIk from '@ikions/react/icons/mail';
import MailOpenIk from '@ikions/react/icons/mail-open';
import MapIk from '@ikions/react/icons/map';
import MapPinIk from '@ikions/react/icons/map-pin';
import MegaphoneIk from '@ikions/react/icons/megaphone';
import MessageCircleIk from '@ikions/react/icons/message-circle';
import MinusIk from '@ikions/react/icons/minus';
import MoneyIk from '@ikions/react/icons/money';
import MoonIk from '@ikions/react/icons/moon';
import MoreIk from '@ikions/react/icons/more';
import MotorcycleIk from '@ikions/react/icons/motorcycle';
import NavigationIk from '@ikions/react/icons/navigation';
import OrangeFruitIk from '@ikions/react/icons/orange-fruit';
import PackageIk from '@ikions/react/icons/package';
import PaletteIk from '@ikions/react/icons/palette';
import PaperPlaneTiltIk from '@ikions/react/icons/paper-plane-tilt';
import PawIk from '@ikions/react/icons/paw';
import PaymentIk from '@ikions/react/icons/payment';
import PencilLineIk from '@ikions/react/icons/pencil-line';
import PepperIk from '@ikions/react/icons/pepper';
import PercentIk from '@ikions/react/icons/percent';
import PhoneIk from '@ikions/react/icons/phone';
import PiggyBankIk from '@ikions/react/icons/piggy-bank';
import PinIk from '@ikions/react/icons/pin';
import PlaneIk from '@ikions/react/icons/plane';
import PlantIk from '@ikions/react/icons/plant';
import PlusIk from '@ikions/react/icons/plus';
import PrinterIk from '@ikions/react/icons/printer';
import QrCodeIk from '@ikions/react/icons/qr-code';
import QuoteIk from '@ikions/react/icons/quote';
import ReceiptIk from '@ikions/react/icons/receipt';
import RefreshIk from '@ikions/react/icons/refresh';
import RiceIk from '@ikions/react/icons/rice';
import RotateCcwIk from '@ikions/react/icons/rotate-ccw';
import RotateCwIk from '@ikions/react/icons/rotate-cw';
import RouteIk from '@ikions/react/icons/route';
import RowsIk from '@ikions/react/icons/rows';
import SaveIk from '@ikions/react/icons/save';
import ScanIk from '@ikions/react/icons/scan';
import ScooterIk from '@ikions/react/icons/scooter';
import SearchIk from '@ikions/react/icons/search';
import SendHorizontalIk from '@ikions/react/icons/send-horizontal';
import SettingsIk from '@ikions/react/icons/settings';
import ShareIk from '@ikions/react/icons/share';
import ShieldAlertIk from '@ikions/react/icons/shield-alert';
import ShieldCheckIk from '@ikions/react/icons/shield-check';
import ShirtIk from '@ikions/react/icons/shirt';
import ShrimpIk from '@ikions/react/icons/shrimp';
import SlidersIk from '@ikions/react/icons/sliders';
import SmartphoneIk from '@ikions/react/icons/smartphone';
import SmileIk from '@ikions/react/icons/smile';
import SortIk from '@ikions/react/icons/sort';
import SoupIk from '@ikions/react/icons/soup';
import SparklesIk from '@ikions/react/icons/sparkles';
import StarIk from '@ikions/react/icons/star';
import StorefrontIk from '@ikions/react/icons/storefront';
import SuccessIk from '@ikions/react/icons/success';
import SunIk from '@ikions/react/icons/sun';
import SwapIk from '@ikions/react/icons/swap';
import TagIk from '@ikions/react/icons/tag';
import TeamIk from '@ikions/react/icons/team';
import TicketIk from '@ikions/react/icons/ticket';
import TimerIk from '@ikions/react/icons/timer';
import TractorVehicleIk from '@ikions/react/icons/tractor-vehicle';
import TranslateIk from '@ikions/react/icons/translate';
import TrashIk from '@ikions/react/icons/trash';
import TrendingDownIk from '@ikions/react/icons/trending-down';
import TrendingUpIk from '@ikions/react/icons/trending-up';
import TruckIk from '@ikions/react/icons/truck';
import UndoIk from '@ikions/react/icons/undo';
import UploadIk from '@ikions/react/icons/upload';
import UserAddIk from '@ikions/react/icons/user-add';
import UserCircleIk from '@ikions/react/icons/user-circle';
import UserIk from '@ikions/react/icons/user';
import UserRemoveIk from '@ikions/react/icons/user-remove';
import UsersIk from '@ikions/react/icons/users';
import UtensilsIk from '@ikions/react/icons/utensils';
import VideoIk from '@ikions/react/icons/video';
import WalletIk from '@ikions/react/icons/wallet';
import WarningIk from '@ikions/react/icons/warning';
import WrenchIk from '@ikions/react/icons/wrench';
import ZapIk from '@ikions/react/icons/zap';
import ZapOffIk from '@ikions/react/icons/zap-off';

// One module per logo (importing the package root would bundle all of Phosphor).
export { FacebookLogoIcon } from 'phosphor-react-native/src/icons/FacebookLogo';
export { InstagramLogoIcon } from 'phosphor-react-native/src/icons/InstagramLogo';

const STROKE = { thin: 1.25, light: 1.5, regular: 1.75, bold: 2.25 };
const MIRROR = { transform: [{ scaleX: -1 }] };

function named(Ikion) {
  function Icon({ size = 24, color = '#000', weight = 'regular', mirrored = false, style, ...rest }) {
    return (
      <Ikion
        size={size}
        color={color}
        variant={weight === 'fill' ? 'filled' : 'outline'}
        strokeWidth={STROKE[weight] ?? STROKE.regular}
        style={mirrored ? [style, MIRROR] : style}
        {...rest}
      />
    );
  }
  Icon.displayName = Ikion.displayName;
  Icon.ikion = Ikion.ikion;
  return Icon;
}

// A double tick (read, all read). Ikions draws one only inside a chat
// bubble, so it is drawn here on their grid; the filled one is heavier.
const tick = (strokeWidth) => ({ fill: 'none', stroke: 'currentColor', strokeWidth, strokeLinecap: 'round', strokeLinejoin: 'round' });
const ChecksIk = createIkion('checks', 'ChecksIcon', {
  outline: [['path', { d: 'M2.75 12.75 6.5 16.5 14.75 8.25' }], ['path', { d: 'M11.5 15.5l1 1 8.25-8.25' }]],
  filled: [
    ['path', { d: 'M2.75 12.75 6.5 16.5 14.75 8.25', ...tick(2.5) }],
    ['path', { d: 'M11.5 15.5l1 1 8.25-8.25', ...tick(2.5) }],
  ],
});

export const ChecksIcon = named(ChecksIk);
export const AirplaneTiltIcon = named(PlaneIk);
export const ArchiveIcon = named(ArchiveIk);
export const ArmchairIcon = named(HomeIk);
export const ArrowClockwiseIcon = named(RotateCwIk);
export const ArrowCounterClockwiseIcon = named(RotateCcwIk);
export const ArrowDownIcon = named(ArrowDownIk);
export const ArrowLeftIcon = named(ArrowLeftIk);
export const ArrowRightIcon = named(ArrowRightIk);
export const ArrowSquareOutIcon = named(ExternalLinkIk);
export const ArrowUUpLeftIcon = named(UndoIk);
export const ArrowUpIcon = named(ArrowUpIk);
export const ArrowUpLeftIcon = named(ArrowUpLeftIk);
export const ArrowUpRightIcon = named(ArrowUpRightIk);
export const ArrowsClockwiseIcon = named(RefreshIk);
export const ArrowsDownUpIcon = named(SortIk);
export const ArrowsLeftRightIcon = named(SwapIk);
export const BarcodeIcon = named(BarcodeIk);
export const BasketIcon = named(BasketIk);
export const BellIcon = named(BellIk);
export const BellRingingIcon = named(BellRingIk);
export const BellSlashIcon = named(BellOffIk);
export const BowlFoodIcon = named(SoupIk);
export const BreadIcon = named(BreadIk);
export const BriefcaseIcon = named(BriefcaseIk);
export const BuildingsIcon = named(CityIk);
export const CalculatorIcon = named(CalculatorIk);
export const CalendarBlankIcon = named(CalendarIk);
export const CalendarCheckIcon = named(CalendarCheckIk);
export const CalendarDotsIcon = named(CalendarIk);
export const CalendarPlusIcon = named(CalendarPlusIk);
export const CameraIcon = named(CameraIk);
export const CaretDownIcon = named(ChevronDownIk);
export const CaretLeftIcon = named(ChevronLeftIk);
export const CaretRightIcon = named(ChevronRightIk);
export const CaretUpIcon = named(ChevronUpIk);
export const CarrotIcon = named(CarrotIk);
export const ChartBarIcon = named(BarChartIk);
export const ChartLineUpIcon = named(LineChartIk);
export const ChatCircleIcon = named(MessageCircleIk);
export const ChatCircleDotsIcon = named(ChatDotsIk);
export const ChatCircleTextIcon = named(CommentTextIk);
export const ChatTeardropTextIcon = named(CommentTextIk);
export const ChatTextIcon = named(CommentTextIk);
export const ChatsCircleIcon = named(ChatsIk);
export const CheckIcon = named(CheckIk);
export const CheckCircleIcon = named(SuccessIk);
export const CircleNotchIcon = named(LoaderIk);
export const ClipboardTextIcon = named(ClipboardListIk);
export const ClockIcon = named(ClockIk);
export const ClockCountdownIcon = named(TimerIk);
export const ClockCounterClockwiseIcon = named(HistoryIk);
export const CoffeeIcon = named(CoffeeIk);
export const CoinsIcon = named(CoinsIk);
export const ConfettiIcon = named(SparklesIk);
export const CookieIcon = named(CookieIk);
export const CookingPotIcon = named(CookingPotIk);
export const CopyIcon = named(CopyIk);
export const CowIcon = named(PawIk);
export const CreditCardIcon = named(CreditCardIk);
export const CrosshairIcon = named(CrosshairIk);
export const CrosshairSimpleIcon = named(CrosshairIk);
export const CubeIcon = named(CubeIk);
export const DatabaseIcon = named(DatabaseIk);
export const DesktopIcon = named(DesktopIk);
export const DeviceMobileIcon = named(SmartphoneIk);
export const DotsThreeIcon = named(MoreIk);
export const DownloadSimpleIcon = named(DownloadIk);
export const DropIcon = named(DropletIk);
export const EggIcon = named(EggIk);
export const EnvelopeOpenIcon = named(MailOpenIk);
export const EnvelopeSimpleIcon = named(MailIk);
export const ExclamationMarkIcon = named(WarningIk);
export const EyeIcon = named(EyeIk);
export const EyeSlashIcon = named(EyeOffIk);
export const FileArrowDownIcon = named(FileDownloadIk);
export const FileTextIcon = named(FileTextIk);
export const FishIcon = named(FishIk);
export const FlagIcon = named(FlagIk);
export const FlagCheckeredIcon = named(FinishFlagIk);
export const FlashlightIcon = named(ZapIk);
export const FloppyDiskIcon = named(SaveIk);
export const FlowerIcon = named(FlowerIk);
export const ForkKnifeIcon = named(UtensilsIk);
export const FunnelIcon = named(FilterIk);
export const GearIcon = named(SettingsIk);
export const GearSixIcon = named(SettingsIk);
export const GiftIcon = named(GiftIk);
export const GlobeIcon = named(GlobeIk);
export const GraduationCapIcon = named(GraduationCapIk);
export const GrainsIcon = named(RiceIk);
export const GridFourIcon = named(GridIk);
export const HandCoinsIcon = named(PaymentIk);
export const HandshakeIcon = named(HandshakeIk);
export const HeadsetIcon = named(HeadsetIk);
export const HeartIcon = named(HeartIk);
export const HeartbeatIcon = named(HeartPulseIk);
export const HouseIcon = named(HomeIk);
export const IdentificationCardIcon = named(IdCardIk);
export const ImageIcon = named(ImageIk);
export const ImageSquareIcon = named(ImageIk);
export const ImagesIcon = named(ImagesIk);
export const InfoIcon = named(InfoIk);
export const JarIcon = named(BottleIk);
export const KeyIcon = named(KeyIk);
export const LaptopIcon = named(LaptopIk);
export const LifebuoyIcon = named(HelpIk);
export const LightbulbIcon = named(LightbulbIk);
export const LightningIcon = named(ZapIk);
export const LightningSlashIcon = named(ZapOffIk);
export const LinkSimpleIcon = named(LinkIk);
export const ListBulletsIcon = named(ListIk);
export const LockIcon = named(LockIk);
export const LockKeyIcon = named(LockIk);
export const LockSimpleIcon = named(LockIk);
export const MagnifyingGlassIcon = named(SearchIk);
export const MapPinIcon = named(MapPinIk);
export const MapTrifoldIcon = named(MapIk);
export const MegaphoneIcon = named(MegaphoneIk);
export const MinusIcon = named(MinusIk);
export const MoneyIcon = named(MoneyIk);
export const MoonIcon = named(MoonIk);
export const MopedIcon = named(ScooterIk);
export const MotorcycleIcon = named(MotorcycleIk);
export const NavigationArrowIcon = named(NavigationIk);
export const NotePencilIcon = named(EditIk);
export const OrangeSliceIcon = named(OrangeFruitIk);
export const PackageIcon = named(PackageIk);
export const PaintBrushIcon = named(BrushIk);
export const PaletteIcon = named(PaletteIk);
export const PaperPlaneRightIcon = named(SendHorizontalIk);
export const PaperPlaneTiltIcon = named(PaperPlaneTiltIk);
export const PathIcon = named(RouteIk);
export const PencilSimpleIcon = named(PencilLineIk);
export const PepperIcon = named(PepperIk);
export const PercentIcon = named(PercentIk);
export const PhoneIcon = named(PhoneIk);
export const PiggyBankIcon = named(PiggyBankIk);
export const PlantIcon = named(PlantIk);
export const PlayCircleIcon = named(CirclePlayIk);
export const PlusIcon = named(PlusIk);
export const PlusCircleIcon = named(CirclePlusIk);
export const PrinterIcon = named(PrinterIk);
export const ProhibitIcon = named(BanIk);
export const PushPinIcon = named(PinIk);
export const QrCodeIcon = named(QrCodeIk);
export const QuestionIcon = named(HelpIk);
export const QuotesIcon = named(QuoteIk);
export const ReceiptIcon = named(ReceiptIk);
export const RocketLaunchIcon = named(DeployRocketIk);
export const RowsIcon = named(RowsIk);
export const ScalesIcon = named(BalanceScaleIk);
export const ScanIcon = named(ScanIk);
export const SealCheckIcon = named(ShieldCheckIk);
export const ShareNetworkIcon = named(ShareIk);
export const ShieldCheckIcon = named(ShieldCheckIk);
export const ShieldWarningIcon = named(ShieldAlertIk);
export const ShoppingBagIcon = named(BagIk);
export const ShoppingCartIcon = named(CartIk);
export const ShoppingCartSimpleIcon = named(CartIk);
export const ShrimpIcon = named(ShrimpIk);
export const SignOutIcon = named(LogOutIk);
export const SlidersHorizontalIcon = named(SlidersIk);
export const SmileyIcon = named(SmileIk);
export const SparkleIcon = named(SparklesIk);
export const SquaresFourIcon = named(LayoutGridIk);
export const StarIcon = named(StarIk);
export const StorefrontIcon = named(StorefrontIk);
export const SunIcon = named(SunIk);
export const TShirtIcon = named(ShirtIk);
export const TagIcon = named(TagIk);
export const TicketIcon = named(TicketIk);
export const TractorIcon = named(TractorVehicleIk);
export const TranslateIcon = named(TranslateIk);
export const TrashIcon = named(TrashIk);
export const TrayIcon = named(InboxIk);
export const TrendDownIcon = named(TrendingDownIk);
export const TrendUpIcon = named(TrendingUpIk);
export const TruckIcon = named(TruckIk);
export const UploadSimpleIcon = named(UploadIk);
export const UserIcon = named(UserIk);
export const UserCircleIcon = named(UserCircleIk);
export const UserMinusIcon = named(UserRemoveIk);
export const UserPlusIcon = named(UserAddIk);
export const UsersIcon = named(UsersIk);
export const UsersThreeIcon = named(TeamIk);
export const VideoIcon = named(VideoIk);
export const WalletIcon = named(WalletIk);
export const WarningIcon = named(WarningIk);
export const WarningCircleIcon = named(WarningIk);
export const WrenchIcon = named(WrenchIk);
export const XIcon = named(CloseIk);
export const XCircleIcon = named(ErrorIk);
