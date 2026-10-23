// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { disposeHelp, showHelp } from '../../src/novel/helpModal.js';

afterEach(() => disposeHelp());

it('renders a help topic and disposes its modal', () => {
    showHelp('generate');
    const modal = document.getElementById('nag-help-modal');
    expect(modal).toBeTruthy();
    expect(modal.textContent).toContain('生成设置说明');
    disposeHelp();
    expect(document.getElementById('nag-help-modal')).toBeNull();
});
