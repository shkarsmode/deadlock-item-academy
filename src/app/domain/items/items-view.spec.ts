import { ITEMS, STANDARD, item } from '../../testing/fixtures';
import { carryStats, componentDiff } from './component-diff';
import { buildUpgradeMap } from './families';
import { formatStat, keyStats, statKind } from './key-stats';

describe('keyStats', () => {
  it('starts with the stats the client highlights and skips the cooldown', () => {
    const rite = keyStats(item('upgrade_health_stimpak'));
    expect(rite.map((s) => s.prop).slice(0, 2)).toEqual(['TotalHealthRegen', 'BonusSprintSpeed']);
    expect(rite.some((s) => s.prop === 'AbilityCooldown')).toBe(false);
    expect(rite.length).toBeLessThanOrEqual(4);
  });

  it('fills up with always-on bonuses and respects the limit', () => {
    const rounds = keyStats(item('upgrade_pristine_emblem'), 3);
    expect(rounds[0].prop).toBe('BaseAttackDamagePercentBonus');
    expect(rounds).toHaveLength(3);
    expect(new Set(rounds.map((s) => s.prop)).size).toBe(3);
  });

  it('gives every standard item at least one number when it has stats', () => {
    for (const it of STANDARD) {
      const hasStats = it.sections.some((s) => s.stats.some((st) => st.prop !== 'AbilityCooldown'));
      if (hasStats) expect(keyStats(it).length, it.key).toBeGreaterThan(0);
    }
  });

  it('groups props by meaning for icons', () => {
    expect(statKind('ImbuedTechPower')).toBe('spirit');
    expect(statKind('BulletArmorReduction')).toBe('shred');
    expect(statKind('CooldownReduction')).toBe('cooldown');
    expect(statKind('SlowResistancePercent')).toBe('resist');
    expect(statKind('MovementSpeedSlow')).toBe('slow');
    expect(statKind('TotalHealthRegen')).toBe('heal');
  });

  it('formats values like the client', () => {
    const surge = item('upgrade_magic_storm').sections.flatMap((s) => s.stats);
    expect(formatStat(surge.find((s) => s.prop === 'ImbuedTechPower')!)).toBe('+28');
    expect(formatStat(surge.find((s) => s.prop === 'MovementSpeedBonusDuration')!)).toBe('8s');
  });
});

describe('buildUpgradeMap', () => {
  const map = buildUpgradeMap(ITEMS);

  it('puts every standard item in a chain or in the standalone list', () => {
    const inChains = new Set(map.families.flatMap((f) => f.keys));
    for (const it of STANDARD) expect(inChains.has(it.key) || map.standalone.some((s) => s.key === it.key), it.key).toBe(true);
    expect(map.standalone.some((s) => inChains.has(s.key))).toBe(false);
    expect([...inChains].every((k) => item(k).mode === 'standard')).toBe(true);
  });

  it('follows components and upgrades from client data, with the top-up price', () => {
    const spirit = map.families.find((f) => f.root === 'upgrade_improved_spirit');
    expect(spirit?.tree.children.map((c) => c.item.key)).toEqual(expect.arrayContaining(['upgrade_soaring_spirit', 'upgrade_magic_storm']));
    const surge = spirit?.tree.children.find((c) => c.item.key === 'upgrade_magic_storm');
    expect(surge?.topUp).toBe(3200 - 800);
    expect(spirit?.tree.topUp).toBeNull();
  });

  it('shows chains that cross categories in every category they touch', () => {
    const stamina = map.families.find((f) => f.keys.includes('upgrade_arcane_surge'));
    expect(stamina?.slots).toEqual(expect.arrayContaining(['vitality', 'spirit']));
  });

  it('notes the second component of items built from two items', () => {
    const nodes = map.families.flatMap((f) => {
      const out: { key: string; also: string[] }[] = [];
      const walk = (n: (typeof f)['tree']) => {
        out.push({ key: n.item.key, also: n.alsoFrom });
        n.children.forEach(walk);
      };
      walk(f.tree);
      return out;
    });
    const sharp = nodes.filter((n) => n.key === 'upgrade_sharpshooter');
    expect(sharp.length).toBeGreaterThanOrEqual(2);
    expect(sharp.every((n) => n.also.length === 1)).toBe(true);
  });
});

describe('componentDiff', () => {
  it('shows that Arcane Surge keeps the stamina of Extra Stamina', () => {
    const d = componentDiff(item('upgrade_arcane_surge'), item('upgrade_improved_stamina'));
    expect(d.missing).toEqual([]);
    expect(d.kept.map((k) => k.stat.prop).sort()).toEqual(['Stamina', 'StaminaCooldownReduction']);
    expect(d.kept.every((k) => k.same)).toBe(true);
    expect(d.added.some((s) => s.prop === 'SpiritPower')).toBe(true);
  });

  it('shows bigger values when the upgrade improves a component stat', () => {
    const d = componentDiff(item('upgrade_sharpshooter'), item('upgrade_high_velocity_mag'));
    const speed = d.kept.find((k) => k.stat.prop === 'BonusBulletSpeedPercent');
    expect(speed?.from).toBe('+45%');
    expect(speed?.to).toBe('+60%');
    expect(speed?.same).toBe(false);
    expect(d.missing).toEqual([]);
  });

  it('lists component stats the upgrade does not have', () => {
    const d = componentDiff(item('upgrade_magic_storm'), item('upgrade_improved_spirit'));
    expect(d.missing.map((s) => s.prop)).toEqual(['TechPower']);
  });

  it('counts the pairs that repeat every component stat', () => {
    const c = carryStats(ITEMS);
    expect(c.total).toBeGreaterThan(50);
    expect(c.full / c.total).toBeGreaterThan(0.6);
  });
});
