/*
 * The site's icons: Ikions (ikions.cloud, the @ikions/react package), under
 * the names the code already used for them (they came from Phosphor) and
 * with Phosphor's props, so a page only imports from here:
 *
 *   <Storefront size={18} weight="fill" />
 *
 *   size      default 1em, like Phosphor
 *   weight    'fill' draws Ikions' filled icon; 'thin', 'light', 'regular'
 *             and 'bold' its outline, thinner to heavier
 *   color, mirrored, alt (an accessible name), and any SVG attribute
 *
 * Without alt or an aria-label an icon is decorative (aria-hidden).
 * Brand logos have no Ikions drawing, so those few stay Phosphor's, and so
 * does Export: the install steps show iOS's own share button.
 */
import {
  createIkion,
  ArchiveIcon, ArrowCircleUpIcon, ArrowDownIcon, ArrowLeftIcon, ArrowRightIcon, ArrowUpIcon,
  ArrowUpLeftIcon, ArrowUpRightIcon, BadgeIdIcon, BagIcon, BalanceScaleIcon, BanIcon, BanknoteIcon,
  BarChartIcon, BarcodeIcon, BasketIcon, BatteryIcon, BellIcon, BellOffIcon, BellRingIcon,
  BicycleIcon, BookOpenIcon, BottleIcon, BreadIcon, BriefcaseIcon, BrushIcon, CalculatorIcon,
  CalendarCheckIcon, CalendarIcon, CalendarPlusIcon, CameraIcon, CarrotIcon, CartIcon,
  ChatDotsIcon, ChatsIcon, CheckIcon, ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon,
  ChevronUpIcon, CircleMinusIcon, CirclePauseIcon, CirclePlayIcon, CirclePlusIcon, CityIcon,
  ClipboardListIcon, ClockIcon, CloseIcon, CoffeeIcon, CoinsIcon, CommentTextIcon, CookieIcon,
  CookingPotIcon, CopyIcon, CreditCardIcon, CrosshairIcon, CubeIcon, DatabaseIcon,
  DeployRocketIcon, DownloadIcon, DropletIcon, EditIcon, EggIcon, EraserIcon, ErrorIcon,
  ExternalLinkIcon, EyeIcon, EyeOffIcon, FileDownloadIcon, FileTextIcon, FilmStripIcon, FilterIcon,
  FinishFlagIcon, FishIcon, FlagIcon, FlowerIcon, GiftIcon, GlobeIcon, GraduationCapIcon, GridIcon,
  HandGrabIcon, HandPointerIcon, HandshakeIcon, HeadsetIcon, HeartHandsIcon, HeartIcon,
  HeartPulseIcon, HelpIcon, HistoryIcon, HomeIcon, IdCardIcon, ImageIcon, ImagesIcon, InboxIcon,
  InfoIcon, KeyIcon, LaptopIcon, LayoutGridIcon, LightbulbIcon, LineChartIcon, LinkIcon,
  ListChecksIcon, ListIcon, LoaderIcon, LockIcon, LogOutIcon, MailIcon, MailOpenIcon, MapIcon,
  MapPinIcon, MaximizeIcon, MegaphoneIcon, MessageCircleIcon, MinimizeIcon, MinusIcon, MoneyIcon,
  MoonIcon, MoreIcon, MoreVerticalIcon, MotorcycleIcon, NavigationIcon, OrangeFruitIcon,
  PackageIcon, PaintRollerIcon, PaletteIcon, PaperPlaneTiltIcon, PaperclipIcon, PauseIcon, PawIcon,
  PaymentIcon, PencilLineIcon, PepperIcon, PercentIcon, PhoneIcon, PieChartIcon, PiggyBankIcon,
  PinIcon, PlaneIcon, PlantIcon, PlayIcon, PlusIcon, PrinterIcon, QrCodeIcon, QuoteIcon,
  ReceiptIcon, RefreshIcon, RiceIcon, RobotIcon, RotateCcwIcon, RotateCwIcon, RouteIcon, RowsIcon,
  RulerIcon, SaveIcon, ScooterIcon, SearchIcon, SelectAreaIcon, SendHorizontalIcon, SettingsIcon,
  ShareIcon, ShieldAlertIcon, ShieldCheckIcon, ShirtIcon, ShrimpIcon, ShuffleIcon, SignalIcon,
  SkipBackIcon, SkipForwardIcon, SlidersIcon, SmartphoneIcon, SmileIcon, SortIcon, SoupIcon,
  SparklesIcon, SquarePlusIcon, StarIcon, StorefrontIcon, SuccessIcon, SunIcon, SwapIcon, TagIcon,
  TeamIcon, TicketIcon, TimerIcon, TractorVehicleIcon, TranslateIcon, TrashIcon, TrendingUpIcon,
  TruckIcon, UndoIcon, UnlockIcon, UnpinIcon, UploadIcon, UserAddIcon, UserCheckIcon,
  UserCircleIcon, UserIcon, UserRemoveIcon, UserSettingsIcon, UsersIcon, UtensilsIcon, VideoIcon,
  VolumeHighIcon, VolumeOffIcon, WalletIcon, WarningIcon, WifiIcon, WifiOffIcon, WrenchIcon,
  ZapIcon, ZapOffIcon,
} from '@ikions/react';
import {
  Export, FacebookLogo, InstagramLogo, MessengerLogo, TelegramLogo, WhatsappLogo, XLogo,
} from '@phosphor-icons/react';

const STROKE = { thin: 1.25, light: 1.5, regular: 1.75, bold: 2.25 };

// A double tick (read, all read). Ikions draws one only inside a chat
// bubble, which reads as a messenger logo, so it is drawn here on their
// grid and stroke; the filled one is the same ticks, heavier.
const tick = (strokeWidth) => ({ fill: 'none', stroke: 'currentColor', strokeWidth, strokeLinecap: 'round', strokeLinejoin: 'round' });
const ChecksIcon = createIkion('checks', 'ChecksIcon', {
  outline: [['path', { d: 'M2.75 12.75 6.5 16.5 14.75 8.25' }], ['path', { d: 'M11.5 15.5l1 1 8.25-8.25' }]],
  filled: [
    ['path', { d: 'M2.75 12.75 6.5 16.5 14.75 8.25', ...tick(2.5) }],
    ['path', { d: 'M11.5 15.5l1 1 8.25-8.25', ...tick(2.5) }],
  ],
});

// One Ikions icon with Phosphor's props.
function Icon({ of: Ikion, size = '1em', weight = 'regular', mirrored = false, alt, style, ...rest }) {
  return (
    <Ikion
      size={size}
      variant={weight === 'fill' ? 'filled' : 'outline'}
      strokeWidth={STROKE[weight] ?? STROKE.regular}
      title={alt}
      style={mirrored ? { ...style, transform: 'scaleX(-1)' } : style}
      {...rest}
    />
  );
}

export {
  Export, FacebookLogo, InstagramLogo, MessengerLogo, TelegramLogo, WhatsappLogo, XLogo,
};

export const AirplaneTilt = (props) => <Icon of={PlaneIcon} {...props} />;
export const Archive = (props) => <Icon of={ArchiveIcon} {...props} />;
export const Armchair = (props) => <Icon of={HomeIcon} {...props} />;
export const ArrowArcLeft = (props) => <Icon of={RotateCcwIcon} {...props} />;
export const ArrowArcRight = (props) => <Icon of={RotateCwIcon} {...props} />;
export const ArrowCircleUp = (props) => <Icon of={ArrowCircleUpIcon} {...props} />;
export const ArrowClockwise = (props) => <Icon of={RotateCwIcon} {...props} />;
export const ArrowCounterClockwise = (props) => <Icon of={RotateCcwIcon} {...props} />;
export const ArrowDown = (props) => <Icon of={ArrowDownIcon} {...props} />;
export const ArrowLeft = (props) => <Icon of={ArrowLeftIcon} {...props} />;
export const ArrowRight = (props) => <Icon of={ArrowRightIcon} {...props} />;
export const ArrowSquareOut = (props) => <Icon of={ExternalLinkIcon} {...props} />;
export const ArrowUUpLeft = (props) => <Icon of={UndoIcon} {...props} />;
export const ArrowUp = (props) => <Icon of={ArrowUpIcon} {...props} />;
export const ArrowUpLeft = (props) => <Icon of={ArrowUpLeftIcon} {...props} />;
export const ArrowUpRight = (props) => <Icon of={ArrowUpRightIcon} {...props} />;
export const ArrowsClockwise = (props) => <Icon of={RefreshIcon} {...props} />;
export const ArrowsDownUp = (props) => <Icon of={SortIcon} {...props} />;
export const ArrowsLeftRight = (props) => <Icon of={SwapIcon} {...props} />;
export const ArrowsOutSimple = (props) => <Icon of={MaximizeIcon} {...props} />;
export const Barcode = (props) => <Icon of={BarcodeIcon} {...props} />;
export const Basket = (props) => <Icon of={BasketIcon} {...props} />;
export const BatteryFull = (props) => <Icon of={BatteryIcon} {...props} />;
export const Bell = (props) => <Icon of={BellIcon} {...props} />;
export const BellRinging = (props) => <Icon of={BellRingIcon} {...props} />;
export const BellSlash = (props) => <Icon of={BellOffIcon} {...props} />;
export const Bicycle = (props) => <Icon of={BicycleIcon} {...props} />;
export const BookOpen = (props) => <Icon of={BookOpenIcon} {...props} />;
export const BoundingBox = (props) => <Icon of={SelectAreaIcon} {...props} />;
export const BowlFood = (props) => <Icon of={SoupIcon} {...props} />;
export const Bread = (props) => <Icon of={BreadIcon} {...props} />;
export const Briefcase = (props) => <Icon of={BriefcaseIcon} {...props} />;
export const Broom = (props) => <Icon of={EraserIcon} {...props} />;
export const Buildings = (props) => <Icon of={CityIcon} {...props} />;
export const Calculator = (props) => <Icon of={CalculatorIcon} {...props} />;
export const Calendar = (props) => <Icon of={CalendarIcon} {...props} />;
export const CalendarBlank = (props) => <Icon of={CalendarIcon} {...props} />;
export const CalendarCheck = (props) => <Icon of={CalendarCheckIcon} {...props} />;
export const CalendarPlus = (props) => <Icon of={CalendarPlusIcon} {...props} />;
export const Camera = (props) => <Icon of={CameraIcon} {...props} />;
export const CaretDown = (props) => <Icon of={ChevronDownIcon} {...props} />;
export const CaretLeft = (props) => <Icon of={ChevronLeftIcon} {...props} />;
export const CaretRight = (props) => <Icon of={ChevronRightIcon} {...props} />;
export const CaretUp = (props) => <Icon of={ChevronUpIcon} {...props} />;
export const Carrot = (props) => <Icon of={CarrotIcon} {...props} />;
export const CellSignalFull = (props) => <Icon of={SignalIcon} {...props} />;
export const ChartBar = (props) => <Icon of={BarChartIcon} {...props} />;
export const ChartLineUp = (props) => <Icon of={LineChartIcon} {...props} />;
export const ChartPie = (props) => <Icon of={PieChartIcon} {...props} />;
export const ChatCircle = (props) => <Icon of={MessageCircleIcon} {...props} />;
export const ChatCircleDots = (props) => <Icon of={ChatDotsIcon} {...props} />;
export const ChatCircleText = (props) => <Icon of={CommentTextIcon} {...props} />;
export const ChatTeardropText = (props) => <Icon of={CommentTextIcon} {...props} />;
export const ChatText = (props) => <Icon of={CommentTextIcon} {...props} />;
export const ChatsCircle = (props) => <Icon of={ChatsIcon} {...props} />;
export const Check = (props) => <Icon of={CheckIcon} {...props} />;
export const CheckCircle = (props) => <Icon of={SuccessIcon} {...props} />;
export const Checks = (props) => <Icon of={ChecksIcon} {...props} />;
export const CircleNotch = (props) => <Icon of={LoaderIcon} {...props} />;
export const ClipboardText = (props) => <Icon of={ClipboardListIcon} {...props} />;
export const Clock = (props) => <Icon of={ClockIcon} {...props} />;
export const ClockCountdown = (props) => <Icon of={TimerIcon} {...props} />;
export const ClockCounterClockwise = (props) => <Icon of={HistoryIcon} {...props} />;
export const Coffee = (props) => <Icon of={CoffeeIcon} {...props} />;
export const Coins = (props) => <Icon of={CoinsIcon} {...props} />;
export const Confetti = (props) => <Icon of={SparklesIcon} {...props} />;
export const Cookie = (props) => <Icon of={CookieIcon} {...props} />;
export const CookingPot = (props) => <Icon of={CookingPotIcon} {...props} />;
export const Copy = (props) => <Icon of={CopyIcon} {...props} />;
export const CornersIn = (props) => <Icon of={MinimizeIcon} {...props} />;
export const CornersOut = (props) => <Icon of={MaximizeIcon} {...props} />;
export const Cow = (props) => <Icon of={PawIcon} {...props} />;
export const CreditCard = (props) => <Icon of={CreditCardIcon} {...props} />;
export const Crosshair = (props) => <Icon of={CrosshairIcon} {...props} />;
export const CrosshairSimple = (props) => <Icon of={CrosshairIcon} {...props} />;
export const Cube = (props) => <Icon of={CubeIcon} {...props} />;
export const CurrencyCircleDollar = (props) => <Icon of={BanknoteIcon} {...props} />;
export const Database = (props) => <Icon of={DatabaseIcon} {...props} />;
export const DeviceMobile = (props) => <Icon of={SmartphoneIcon} {...props} />;
export const DotsThree = (props) => <Icon of={MoreIcon} {...props} />;
export const DotsThreeVertical = (props) => <Icon of={MoreVerticalIcon} {...props} />;
export const DownloadSimple = (props) => <Icon of={DownloadIcon} {...props} />;
export const Drop = (props) => <Icon of={DropletIcon} {...props} />;
export const Egg = (props) => <Icon of={EggIcon} {...props} />;
export const Envelope = (props) => <Icon of={MailIcon} {...props} />;
export const EnvelopeOpen = (props) => <Icon of={MailOpenIcon} {...props} />;
export const EnvelopeSimple = (props) => <Icon of={MailIcon} {...props} />;
export const Eraser = (props) => <Icon of={EraserIcon} {...props} />;
export const ExclamationMark = (props) => <Icon of={WarningIcon} {...props} />;
export const Eye = (props) => <Icon of={EyeIcon} {...props} />;
export const EyeSlash = (props) => <Icon of={EyeOffIcon} {...props} />;
export const FileArrowDown = (props) => <Icon of={FileDownloadIcon} {...props} />;
export const FileText = (props) => <Icon of={FileTextIcon} {...props} />;
export const FilmStrip = (props) => <Icon of={FilmStripIcon} {...props} />;
export const Fish = (props) => <Icon of={FishIcon} {...props} />;
export const Flag = (props) => <Icon of={FlagIcon} {...props} />;
export const FlagCheckered = (props) => <Icon of={FinishFlagIcon} {...props} />;
export const FloppyDisk = (props) => <Icon of={SaveIcon} {...props} />;
export const Flower = (props) => <Icon of={FlowerIcon} {...props} />;
export const ForkKnife = (props) => <Icon of={UtensilsIcon} {...props} />;
export const Funnel = (props) => <Icon of={FilterIcon} {...props} />;
export const Gear = (props) => <Icon of={SettingsIcon} {...props} />;
export const GearSix = (props) => <Icon of={SettingsIcon} {...props} />;
export const Gift = (props) => <Icon of={GiftIcon} {...props} />;
export const Globe = (props) => <Icon of={GlobeIcon} {...props} />;
export const GraduationCap = (props) => <Icon of={GraduationCapIcon} {...props} />;
export const Grains = (props) => <Icon of={RiceIcon} {...props} />;
export const GridFour = (props) => <Icon of={GridIcon} {...props} />;
export const HandCoins = (props) => <Icon of={PaymentIcon} {...props} />;
export const HandGrabbing = (props) => <Icon of={HandGrabIcon} {...props} />;
export const HandHeart = (props) => <Icon of={HeartHandsIcon} {...props} />;
export const HandTap = (props) => <Icon of={HandPointerIcon} {...props} />;
export const Handshake = (props) => <Icon of={HandshakeIcon} {...props} />;
export const Headset = (props) => <Icon of={HeadsetIcon} {...props} />;
export const Heart = (props) => <Icon of={HeartIcon} {...props} />;
export const Heartbeat = (props) => <Icon of={HeartPulseIcon} {...props} />;
export const House = (props) => <Icon of={HomeIcon} {...props} />;
export const IdentificationBadge = (props) => <Icon of={BadgeIdIcon} {...props} />;
export const IdentificationCard = (props) => <Icon of={IdCardIcon} {...props} />;
export const Image = (props) => <Icon of={ImageIcon} {...props} />;
export const ImageSquare = (props) => <Icon of={ImageIcon} {...props} />;
export const Images = (props) => <Icon of={ImagesIcon} {...props} />;
export const Info = (props) => <Icon of={InfoIcon} {...props} />;
export const Jar = (props) => <Icon of={BottleIcon} {...props} />;
export const Key = (props) => <Icon of={KeyIcon} {...props} />;
export const Laptop = (props) => <Icon of={LaptopIcon} {...props} />;
export const Lifebuoy = (props) => <Icon of={HelpIcon} {...props} />;
export const Lightbulb = (props) => <Icon of={LightbulbIcon} {...props} />;
export const Lightning = (props) => <Icon of={ZapIcon} {...props} />;
export const LightningSlash = (props) => <Icon of={ZapOffIcon} {...props} />;
export const LinkSimple = (props) => <Icon of={LinkIcon} {...props} />;
export const List = (props) => <Icon of={ListIcon} {...props} />;
export const ListBullets = (props) => <Icon of={ListIcon} {...props} />;
export const ListChecks = (props) => <Icon of={ListChecksIcon} {...props} />;
export const Lock = (props) => <Icon of={LockIcon} {...props} />;
export const LockKey = (props) => <Icon of={LockIcon} {...props} />;
export const LockSimple = (props) => <Icon of={LockIcon} {...props} />;
export const LockSimpleOpen = (props) => <Icon of={UnlockIcon} {...props} />;
export const MagnifyingGlass = (props) => <Icon of={SearchIcon} {...props} />;
export const MapPin = (props) => <Icon of={MapPinIcon} {...props} />;
export const MapTrifold = (props) => <Icon of={MapIcon} {...props} />;
export const Megaphone = (props) => <Icon of={MegaphoneIcon} {...props} />;
export const Minus = (props) => <Icon of={MinusIcon} {...props} />;
export const MinusCircle = (props) => <Icon of={CircleMinusIcon} {...props} />;
export const Money = (props) => <Icon of={MoneyIcon} {...props} />;
export const Moon = (props) => <Icon of={MoonIcon} {...props} />;
export const Moped = (props) => <Icon of={ScooterIcon} {...props} />;
export const Motorcycle = (props) => <Icon of={MotorcycleIcon} {...props} />;
export const NavigationArrow = (props) => <Icon of={NavigationIcon} {...props} />;
export const NotePencil = (props) => <Icon of={EditIcon} {...props} />;
export const OrangeSlice = (props) => <Icon of={OrangeFruitIcon} {...props} />;
export const Package = (props) => <Icon of={PackageIcon} {...props} />;
export const PaintBrush = (props) => <Icon of={BrushIcon} {...props} />;
export const PaintBrushBroad = (props) => <Icon of={PaintRollerIcon} {...props} />;
export const Palette = (props) => <Icon of={PaletteIcon} {...props} />;
export const PaperPlaneRight = (props) => <Icon of={SendHorizontalIcon} {...props} />;
export const PaperPlaneTilt = (props) => <Icon of={PaperPlaneTiltIcon} {...props} />;
export const Paperclip = (props) => <Icon of={PaperclipIcon} {...props} />;
export const Path = (props) => <Icon of={RouteIcon} {...props} />;
export const Pause = (props) => <Icon of={PauseIcon} {...props} />;
export const PauseCircle = (props) => <Icon of={CirclePauseIcon} {...props} />;
export const PencilSimple = (props) => <Icon of={PencilLineIcon} {...props} />;
export const PencilSimpleLine = (props) => <Icon of={PencilLineIcon} {...props} />;
export const Pepper = (props) => <Icon of={PepperIcon} {...props} />;
export const Percent = (props) => <Icon of={PercentIcon} {...props} />;
export const Phone = (props) => <Icon of={PhoneIcon} {...props} />;
export const PiggyBank = (props) => <Icon of={PiggyBankIcon} {...props} />;
export const Plant = (props) => <Icon of={PlantIcon} {...props} />;
export const Play = (props) => <Icon of={PlayIcon} {...props} />;
export const PlayCircle = (props) => <Icon of={CirclePlayIcon} {...props} />;
export const Plus = (props) => <Icon of={PlusIcon} {...props} />;
export const PlusCircle = (props) => <Icon of={CirclePlusIcon} {...props} />;
export const PlusSquare = (props) => <Icon of={SquarePlusIcon} {...props} />;
export const Printer = (props) => <Icon of={PrinterIcon} {...props} />;
export const Prohibit = (props) => <Icon of={BanIcon} {...props} />;
export const PushPin = (props) => <Icon of={PinIcon} {...props} />;
export const PushPinSlash = (props) => <Icon of={UnpinIcon} {...props} />;
export const QrCode = (props) => <Icon of={QrCodeIcon} {...props} />;
export const Question = (props) => <Icon of={HelpIcon} {...props} />;
export const Quotes = (props) => <Icon of={QuoteIcon} {...props} />;
export const Receipt = (props) => <Icon of={ReceiptIcon} {...props} />;
export const Robot = (props) => <Icon of={RobotIcon} {...props} />;
export const RocketLaunch = (props) => <Icon of={DeployRocketIcon} {...props} />;
export const Rows = (props) => <Icon of={RowsIcon} {...props} />;
export const Ruler = (props) => <Icon of={RulerIcon} {...props} />;
export const Scales = (props) => <Icon of={BalanceScaleIcon} {...props} />;
export const SealCheck = (props) => <Icon of={ShieldCheckIcon} {...props} />;
export const ShareNetwork = (props) => <Icon of={ShareIcon} {...props} />;
export const ShieldCheck = (props) => <Icon of={ShieldCheckIcon} {...props} />;
export const ShieldWarning = (props) => <Icon of={ShieldAlertIcon} {...props} />;
export const ShoppingBag = (props) => <Icon of={BagIcon} {...props} />;
export const ShoppingCart = (props) => <Icon of={CartIcon} {...props} />;
export const ShoppingCartSimple = (props) => <Icon of={CartIcon} {...props} />;
export const Shrimp = (props) => <Icon of={ShrimpIcon} {...props} />;
export const Shuffle = (props) => <Icon of={ShuffleIcon} {...props} />;
export const SignOut = (props) => <Icon of={LogOutIcon} {...props} />;
export const SkipBack = (props) => <Icon of={SkipBackIcon} {...props} />;
export const SkipForward = (props) => <Icon of={SkipForwardIcon} {...props} />;
export const SlidersHorizontal = (props) => <Icon of={SlidersIcon} {...props} />;
export const Smiley = (props) => <Icon of={SmileIcon} {...props} />;
export const Sparkle = (props) => <Icon of={SparklesIcon} {...props} />;
export const SpeakerHigh = (props) => <Icon of={VolumeHighIcon} {...props} />;
export const SpeakerSlash = (props) => <Icon of={VolumeOffIcon} {...props} />;
export const SpinnerGap = (props) => <Icon of={LoaderIcon} {...props} />;
export const SquaresFour = (props) => <Icon of={LayoutGridIcon} {...props} />;
export const Star = (props) => <Icon of={StarIcon} {...props} />;
export const Storefront = (props) => <Icon of={StorefrontIcon} {...props} />;
export const Sun = (props) => <Icon of={SunIcon} {...props} />;
export const TShirt = (props) => <Icon of={ShirtIcon} {...props} />;
export const Tag = (props) => <Icon of={TagIcon} {...props} />;
export const Ticket = (props) => <Icon of={TicketIcon} {...props} />;
export const Tractor = (props) => <Icon of={TractorVehicleIcon} {...props} />;
export const Translate = (props) => <Icon of={TranslateIcon} {...props} />;
export const Trash = (props) => <Icon of={TrashIcon} {...props} />;
export const Tray = (props) => <Icon of={InboxIcon} {...props} />;
export const TrendUp = (props) => <Icon of={TrendingUpIcon} {...props} />;
export const Truck = (props) => <Icon of={TruckIcon} {...props} />;
export const UploadSimple = (props) => <Icon of={UploadIcon} {...props} />;
export const User = (props) => <Icon of={UserIcon} {...props} />;
export const UserCheck = (props) => <Icon of={UserCheckIcon} {...props} />;
export const UserCircle = (props) => <Icon of={UserCircleIcon} {...props} />;
export const UserGear = (props) => <Icon of={UserSettingsIcon} {...props} />;
export const UserMinus = (props) => <Icon of={UserRemoveIcon} {...props} />;
export const UserPlus = (props) => <Icon of={UserAddIcon} {...props} />;
export const Users = (props) => <Icon of={UsersIcon} {...props} />;
export const UsersThree = (props) => <Icon of={TeamIcon} {...props} />;
export const Video = (props) => <Icon of={VideoIcon} {...props} />;
export const VideoCamera = (props) => <Icon of={VideoIcon} {...props} />;
export const Wallet = (props) => <Icon of={WalletIcon} {...props} />;
export const Warning = (props) => <Icon of={WarningIcon} {...props} />;
export const WarningCircle = (props) => <Icon of={WarningIcon} {...props} />;
export const WifiHigh = (props) => <Icon of={WifiIcon} {...props} />;
export const WifiSlash = (props) => <Icon of={WifiOffIcon} {...props} />;
export const Wrench = (props) => <Icon of={WrenchIcon} {...props} />;
export const X = (props) => <Icon of={CloseIcon} {...props} />;
export const XCircle = (props) => <Icon of={ErrorIcon} {...props} />;
