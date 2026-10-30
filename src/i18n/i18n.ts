import { useCallback } from 'react';
import { useStore } from '../store/project';

const en: Record<string, string> = {
  'mode.graphing': 'Graphing Calculator', 'mode.geometry': 'Geometry', 'mode.3d': '3D Calculator',
  'modeShort.graphing': 'Graphing', 'modeShort.geometry': 'Geometry', 'modeShort.3d': '3D Graphing',
  'panel.algebra': 'Algebra', 'panel.tools': 'Tools', 'panel.table': 'Table', 'panel.spreadsheet': 'Spreadsheet',
  input: 'Input…', file: 'File', new: 'New', open: 'Open…', save: 'Save', saveAs: 'Save as…',
  exportPng: 'Export image (PNG)', exportSvg: 'Export vector (SVG)', exportCsv: 'Export table (CSV)', exportSheetCsv: 'Export spreadsheet (CSV)',
  importCsv: 'Import CSV…', settings: 'Settings', language: 'العربية', share: 'Copy share link', undo: 'Undo', redo: 'Redo',
  help: 'Help & examples', close: 'Close', cancel: 'Cancel', apply: 'Apply', menu: 'Menu', keyboard: 'Keyboard',
  grid: 'Show grid', axes: 'Show axes', labels: 'Show labels', snap: 'Snap points to grid', digits: 'Decimal places',
  range3d: '3D range (±)', xRange: 'x range', yRange: 'y range', view: 'View', general: 'General',
  saved: 'Saved', saveFailed: 'Could not save the file', opened: 'Project opened', openFailed: 'Not a valid Matharium file',
  imported: 'CSV imported into the spreadsheet', linkCopied: 'Share link copied', linkFailed: 'Could not copy link',
  svg3d: 'SVG export is available in 2D views', pickObject: 'Select a suitable object',
  redefined: 'Existing object redefined (Ctrl+Z to undo)',
  install: 'Install app', installIos: 'To install: tap Share, then “Add to Home Screen”',
  updateReady: 'A new version is available', reload: 'Reload', offlineReady: 'Ready to work offline',
  delete: 'Delete', duplicate: 'Duplicate', rename: 'Rename', color: 'Color', show: 'Show', hide: 'Hide',
  showLabel: 'Show label', min: 'min', max: 'max', step: 'step', play: 'Animate', pause: 'Pause', more: 'More',
  onlyIn3d: 'shown in the 3D view', home: 'Standard view', zoomIn: 'Zoom in', zoomOut: 'Zoom out', fullscreen: 'Fullscreen',
  toggleGrid: 'Toggle grid', addItem: 'Add', slider: 'Slider', createSliders: 'Sliders created for',
  'table.fns': 'Functions', 'table.start': 'Start', 'table.end': 'End', 'table.step': 'Step', 'table.empty': 'Define a function in Algebra to tabulate it.',
  'sheet.plot': 'Plot A,B as points', 'sheet.fit': 'Regression line', 'sheet.help': 'Numbers, text or formulas like =A1*2, =sum(A1:A5), =f(B2)',
  'kb.123': '123', 'kb.fx': 'f(x)', 'kb.abc': 'ABC', 'kb.sym': '#&¬',
  'tool.move': 'Move', 'tool.point': 'Point', 'tool.pointOn': 'Point on object', 'tool.segment': 'Segment', 'tool.line': 'Line', 'tool.ray': 'Ray',
  'tool.vector': 'Vector', 'tool.polygon': 'Polygon', 'tool.circle': 'Circle: center & point', 'tool.circle3': 'Circle through 3 points',
  'tool.midpoint': 'Midpoint', 'tool.perpendicular': 'Perpendicular line', 'tool.parallel': 'Parallel line',
  'tool.bisector': 'Perpendicular bisector', 'tool.intersect': 'Intersect', 'tool.tangent': 'Tangent',
  'tool.distance': 'Distance', 'tool.angle': 'Angle', 'tool.slider': 'Slider', 'tool.delete': 'Delete',
  'toolHelp.point': 'Click on the graph', 'toolHelp.pointOn': 'Click a curve, circle, line or polygon', 'toolHelp.segment': 'Select two points', 'toolHelp.line': 'Select two points',
  'toolHelp.ray': 'Select start point, then a direction point', 'toolHelp.vector': 'Select start and end point',
  'toolHelp.polygon': 'Select vertices, then the first again', 'toolHelp.circle': 'Select center, then a point on the circle',
  'toolHelp.circle3': 'Select three points', 'toolHelp.midpoint': 'Select two points', 'toolHelp.perpendicular': 'Select point, then a line',
  'toolHelp.parallel': 'Select point, then a line', 'toolHelp.bisector': 'Select two points', 'toolHelp.intersect': 'Select two objects',
  'toolHelp.tangent': 'Select point, then a function', 'toolHelp.distance': 'Select two points', 'toolHelp.angle': 'Select three points (vertex second)',
  'toolHelp.slider': 'Click to add a slider', 'toolHelp.delete': 'Click an object to delete it', 'toolHelp.move': 'Drag to pan, drag free points',
  'group.basic': 'Basic', 'group.lines': 'Lines', 'group.construct': 'Construct', 'group.measure': 'Measure', 'group.edit': 'Edit',
  'help.title': 'Quick reference', 'help.functions': 'Functions & equations', 'help.commands': 'Commands', 'help.geometry': 'Geometry',
  'help.3d': '3D', 'help.keys': 'Shortcuts', 'help.calculus': 'Calculus', 'help.stats': 'Statistics & probability',
  'ac.commands': 'Commands', 'ac.objects': 'Objects', 'ac.hint': 'Tab or Enter to insert · Esc to close',
  untitled: 'Untitled', empty: 'Type a function, equation, point or command',
};

const ar: Record<string, string> = {
  'mode.graphing': 'الآلة الحاسبة البيانية', 'mode.geometry': 'الهندسة', 'mode.3d': 'الحاسبة ثلاثية الأبعاد',
  'modeShort.graphing': 'الرسم البياني', 'modeShort.geometry': 'الهندسة', 'modeShort.3d': 'الرسم ثلاثي الأبعاد',
  'panel.algebra': 'الجبر', 'panel.tools': 'الأدوات', 'panel.table': 'الجدول', 'panel.spreadsheet': 'الجدول الحسابي',
  input: 'إدخال…', file: 'ملف', new: 'جديد', open: 'فتح…', save: 'حفظ', saveAs: 'حفظ باسم…',
  exportPng: 'تصدير صورة (PNG)', exportSvg: 'تصدير متجه (SVG)', exportCsv: 'تصدير الجدول (CSV)', exportSheetCsv: 'تصدير الجدول الحسابي (CSV)',
  importCsv: 'استيراد CSV…', settings: 'الإعدادات', language: 'English', share: 'نسخ رابط المشاركة', undo: 'تراجع', redo: 'إعادة',
  help: 'مساعدة وأمثلة', close: 'إغلاق', cancel: 'إلغاء', apply: 'تطبيق', menu: 'القائمة', keyboard: 'لوحة المفاتيح',
  grid: 'إظهار الشبكة', axes: 'إظهار المحاور', labels: 'إظهار التسميات', snap: 'محاذاة النقاط للشبكة', digits: 'المنازل العشرية',
  range3d: 'المدى ثلاثي الأبعاد (±)', xRange: 'مدى x', yRange: 'مدى y', view: 'العرض', general: 'عام',
  saved: 'تم الحفظ', saveFailed: 'تعذّر حفظ الملف', opened: 'تم فتح المشروع', openFailed: 'ليس ملف Matharium صالحًا',
  imported: 'تم استيراد CSV إلى الجدول الحسابي', linkCopied: 'تم نسخ رابط المشاركة', linkFailed: 'تعذّر نسخ الرابط',
  svg3d: 'تصدير SVG متاح في العرض ثنائي الأبعاد', pickObject: 'اختر كائنًا مناسبًا',
  redefined: 'أُعيد تعريف كائن موجود (Ctrl+Z للتراجع)',
  install: 'تثبيت التطبيق', installIos: 'للتثبيت: اضغط مشاركة ثم «إضافة إلى الشاشة الرئيسية»',
  updateReady: 'يتوفر إصدار جديد', reload: 'إعادة التحميل', offlineReady: 'جاهز للعمل دون إنترنت',
  delete: 'حذف', duplicate: 'تكرار', rename: 'إعادة تسمية', color: 'اللون', show: 'إظهار', hide: 'إخفاء',
  showLabel: 'إظهار التسمية', min: 'الأدنى', max: 'الأعلى', step: 'الخطوة', play: 'تحريك', pause: 'إيقاف', more: 'المزيد',
  onlyIn3d: 'يظهر في العرض ثلاثي الأبعاد', home: 'العرض القياسي', zoomIn: 'تكبير', zoomOut: 'تصغير', fullscreen: 'ملء الشاشة',
  toggleGrid: 'تبديل الشبكة', addItem: 'إضافة', slider: 'منزلق', createSliders: 'أُنشئت منزلقات لـ',
  'table.fns': 'الدوال', 'table.start': 'البداية', 'table.end': 'النهاية', 'table.step': 'الخطوة', 'table.empty': 'عرّف دالة في قسم الجبر لعرض جدول قيمها.',
  'sheet.plot': 'ارسم A,B كنقاط', 'sheet.fit': 'خط الانحدار', 'sheet.help': 'أرقام أو نصوص أو صيغ مثل ‎=A1*2‎ و ‎=sum(A1:A5)‎',
  'kb.123': '123', 'kb.fx': 'f(x)', 'kb.abc': 'ABC', 'kb.sym': '#&¬',
  'tool.move': 'تحريك', 'tool.point': 'نقطة', 'tool.pointOn': 'نقطة على كائن', 'tool.segment': 'قطعة مستقيمة', 'tool.line': 'مستقيم', 'tool.ray': 'شعاع',
  'tool.vector': 'متجه', 'tool.polygon': 'مضلع', 'tool.circle': 'دائرة: مركز ونقطة', 'tool.circle3': 'دائرة بثلاث نقاط',
  'tool.midpoint': 'منتصف', 'tool.perpendicular': 'مستقيم عمودي', 'tool.parallel': 'مستقيم موازٍ',
  'tool.bisector': 'العمود المنصّف', 'tool.intersect': 'تقاطع', 'tool.tangent': 'مماس',
  'tool.distance': 'المسافة', 'tool.angle': 'زاوية', 'tool.slider': 'منزلق', 'tool.delete': 'حذف',
  'toolHelp.point': 'انقر على الرسم', 'toolHelp.pointOn': 'انقر على منحنى أو دائرة أو مستقيم أو مضلع', 'toolHelp.segment': 'اختر نقطتين', 'toolHelp.line': 'اختر نقطتين',
  'toolHelp.ray': 'اختر نقطة البداية ثم نقطة الاتجاه', 'toolHelp.vector': 'اختر نقطة البداية والنهاية',
  'toolHelp.polygon': 'اختر الرؤوس ثم الرأس الأول مجددًا', 'toolHelp.circle': 'اختر المركز ثم نقطة على الدائرة',
  'toolHelp.circle3': 'اختر ثلاث نقاط', 'toolHelp.midpoint': 'اختر نقطتين', 'toolHelp.perpendicular': 'اختر نقطة ثم مستقيمًا',
  'toolHelp.parallel': 'اختر نقطة ثم مستقيمًا', 'toolHelp.bisector': 'اختر نقطتين', 'toolHelp.intersect': 'اختر كائنين',
  'toolHelp.tangent': 'اختر نقطة ثم دالة', 'toolHelp.distance': 'اختر نقطتين', 'toolHelp.angle': 'اختر ثلاث نقاط (الرأس ثانيًا)',
  'toolHelp.slider': 'انقر لإضافة منزلق', 'toolHelp.delete': 'انقر على كائن لحذفه', 'toolHelp.move': 'اسحب للتنقل أو لتحريك النقاط',
  'group.basic': 'أساسي', 'group.lines': 'المستقيمات', 'group.construct': 'إنشاء', 'group.measure': 'قياس', 'group.edit': 'تحرير',
  'help.title': 'مرجع سريع', 'help.functions': 'الدوال والمعادلات', 'help.commands': 'الأوامر', 'help.geometry': 'الهندسة',
  'help.3d': 'ثلاثي الأبعاد', 'help.keys': 'الاختصارات', 'help.calculus': 'التفاضل والتكامل', 'help.stats': 'الإحصاء والاحتمالات',
  'ac.commands': 'الأوامر', 'ac.objects': 'الكائنات', 'ac.hint': 'Tab أو Enter للإدراج · Esc للإغلاق',
  untitled: 'بدون عنوان', empty: 'اكتب دالة أو معادلة أو نقطة أو أمرًا',
};

const dicts = { en, ar };

export function translate(lang: 'en' | 'ar', key: string) {
  return dicts[lang][key] ?? en[key] ?? key;
}

export function useT() {
  const lang = useStore((s) => s.settings.lang);
  return useCallback((key: string) => translate(lang, key), [lang]);
}
