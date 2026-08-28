import { loadFont } from '@remotion/fonts';
import { staticFile } from 'remotion';

// Self-hosted SIL Open Font License assets: renders do not need Google Fonts.
loadFont({ family: 'Anton', url: staticFile('fonts/anton-latin-400.woff2'), weight: '400' });
loadFont({ family: 'Inter', url: staticFile('fonts/inter-latin-400.woff2'), weight: '400' });
loadFont({ family: 'Inter', url: staticFile('fonts/inter-latin-600.woff2'), weight: '600' });
loadFont({ family: 'Inter', url: staticFile('fonts/inter-latin-800.woff2'), weight: '800' });
