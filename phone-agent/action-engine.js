import { tap, swipe, inputText, launchApp, screenshot, keyEvent } from './adb-bridge.js';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function resolveTemplate(str, params) {
  return str.replace(/\{\{(\w+)\}\}/g, (_, key) => params[key] ?? `{{${key}}}`);
}

export async function executeActions(actions, params = {}) {
  const screenshots = [];

  for (const action of actions) {
    switch (action.type) {
      case 'launch':
        await launchApp(resolveTemplate(action.package, params));
        break;

      case 'tap':
        await tap(action.x, action.y);
        break;

      case 'swipe':
        await swipe(action.x1, action.y1, action.x2, action.y2, action.duration || 300);
        break;

      case 'wait':
        await sleep(action.ms || 1000);
        break;

      case 'input_text':
        await tap(action.x || 540, action.y || 500);
        await sleep(300);
        await inputText(resolveTemplate(action.content, params));
        break;

      case 'screenshot': {
        const path = screenshot(resolveTemplate(action.name, params));
        if (path) screenshots.push({ name: action.name, path });
        break;
      }

      case 'back':
        keyEvent('back');
        await sleep(500);
        break;

      case 'home':
        keyEvent('home');
        await sleep(500);
        break;

      default:
        console.warn(`未知 action type: ${action.type}`);
    }
    await sleep(100);
  }

  return { success: true, screenshots };
}
