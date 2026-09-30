import { expect, it } from 'vitest';
import { convertSTFormatToInternal, stEntryToCard, cardEntryToST } from '../../src/worldbook/formats/sillyTavern.js';
import { createExportFormatService } from '../../txtToWorldbook/services/exportFormatService.js';
import { loadSettingsRecord } from '../../src/storage/settingsStore.js';

it('preserves ST behavior and unknown extension fields through an internal roundtrip', () => {
    const entry = {
        uid: 8,
        comment: '角色 - 人',
        key: ['人'],
        content: '正文',
        disable: true,
        probability: 42,
        depth: 7,
        position: 4,
        keysecondary: ['地点'],
        selectiveLogic: 2,
        preventRecursion: true,
        extensions: { future: 'kept' },
    };
    const internal = convertSTFormatToInternal({ entries: { 8: entry } });
    const service = createExportFormatService({
        AppState: { settings: {} },
        naturalSortEntryNames: (a) => a,
        getCategoryLightState: () => false,
        getCategoryAutoIncrement: () => false,
        getCategoryBaseOrder: () => 100,
        getEntryConfig: () => ({}),
    });
    const exported = service.convertToSillyTavernFormat(internal).entries[0];
    expect(exported).toMatchObject(entry);
    internal.角色.人.内容 = '修改正文';
    expect(service.convertToSillyTavernFormat(internal).entries[0].content).toBe('修改正文');
});

it('imports character-book data and preserves unknown card and ST fields', () => {
    const card = {
        id: 0,
        keys: ['人'],
        content: '正文',
        comment: '角色 - 人',
        enabled: false,
        insertion_order: 71,
        futureField: 'value',
        extensions: { position: 4, depth: 8, group_weight: 9, custom: { nested: true } },
    };
    const internal = convertSTFormatToInternal({ data: { character_book: { entries: [card] } } });
    expect(internal.角色.人._st).toMatchObject({ disable: true, position: 4, depth: 8, groupWeight: 9 });
    const restored = stEntryToCard(cardEntryToST(card), 0);
    expect(restored.futureField).toBe('value');
    expect(restored.extensions.custom).toEqual({ nested: true });
    expect(restored.enabled).toBe(false);
});

it('preserves duplicate imports for explicit resolution and rejects prototype entry names', () => {
    const entry = { comment: '角色 - 人', content: 'A' };
    expect(convertSTFormatToInternal({ entries: [entry, { ...entry, content: 'B' }] }, true).duplicates).toHaveLength(
        1,
    );
    expect(() => convertSTFormatToInternal({ entries: [{ comment: '__proto__ - bad' }] })).toThrow();
});

it('migrates old local credentials separately without losing model settings', () => {
    const values = new Map([
        ['txtToWorldbookSettings', JSON.stringify({ customApiKey: 'secret', customApiModel: 'model' })],
    ]);
    const storage = { getItem: (key) => values.get(key), setItem: (key, value) => values.set(key, value) };
    expect(loadSettingsRecord(storage)).toMatchObject({ customApiKey: 'secret', customApiModel: 'model' });
    expect(JSON.parse(values.get('txtToWorldbookSettings'))).toEqual({ customApiModel: 'model' });
    expect(JSON.parse(values.get('txtToWorldbookSettings:credentials'))).toEqual({ customApiKey: 'secret' });
});
