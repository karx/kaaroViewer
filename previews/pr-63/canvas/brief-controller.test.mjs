import { vi, describe, it, expect, beforeEach } from 'vitest';
import { seedDOM, resetDOM } from './testSetup.mjs';

vi.mock('./slides.mjs', () => ({
  renderSlides: vi.fn(), showSlides: vi.fn(), hideSlides: vi.fn(),
  isSlidesVisible: vi.fn(() => false),
  notifySceneResult: vi.fn(),
}));
vi.mock('./report.mjs', () => ({
  renderReport: vi.fn(), showReport: vi.fn(), hideReport: vi.fn(),
  isReportVisible: vi.fn(() => false),
}));
vi.mock('./scene-painter.mjs', () => ({
  rehydrateSlides: vi.fn(() => Promise.resolve([])),
  clearAllSlides:  vi.fn(),
}));
vi.mock('./scene.mjs', () => ({ getCamera: vi.fn(() => ({})) }));
vi.mock('./nodes.mjs', () => ({ clearDim: vi.fn() }));
vi.mock('../pipeline/local-graph.mjs', () => ({ getDocMeta: vi.fn(() => null) }));
vi.mock('../logger.mjs', () => ({ log: vi.fn() }));
vi.mock('./app-state.mjs', () => ({
  getBriefMode:       vi.fn(() => 'slides'),
  setBriefMode:       vi.fn(),
  getLastLoadedDocId: vi.fn(() => null),
}));

// Imports must come after vi.mock() hoisting
const { initBriefController, showBrief, hideBrief, toggleReportMode } =
  await import('./brief-controller.mjs');

const slides   = await import('./slides.mjs');
const report   = await import('./report.mjs');
const scenePainter = await import('./scene-painter.mjs');
const logMod   = await import('../logger.mjs');
const appState = await import('./app-state.mjs');
const localGraph = await import('../pipeline/local-graph.mjs');
const nodesMod = await import('./nodes.mjs');

describe('brief-controller', () => {
  beforeEach(() => {
    resetDOM();
    vi.clearAllMocks();
    // Reset defaults
    appState.getBriefMode.mockReturnValue('slides');
    appState.getLastLoadedDocId.mockReturnValue(null);
    slides.isSlidesVisible.mockReturnValue(false);
    report.isReportVisible.mockReturnValue(false);
    localGraph.getDocMeta.mockReturnValue(null);
    scenePainter.rehydrateSlides.mockResolvedValue([]);
  });

  describe('initBriefController()', () => {
    it('does not throw when called with the testSetup DOM', () => {
      expect(() => initBriefController()).not.toThrow();
    });
  });

  describe('showBrief(meta)', () => {
    const meta = { id: 'doc1', title: 'Test Doc' };

    it('in slides mode calls renderSlides and showSlides, not renderReport', () => {
      appState.getBriefMode.mockReturnValue('slides');
      showBrief(meta);
      expect(slides.renderSlides).toHaveBeenCalledWith(meta);
      expect(slides.showSlides).toHaveBeenCalled();
      expect(report.renderReport).not.toHaveBeenCalled();
    });

    it('in reader mode calls renderReport and showReport', () => {
      appState.getBriefMode.mockReturnValue('reader');
      showBrief(meta);
      expect(report.renderReport).toHaveBeenCalledWith(meta);
      expect(report.showReport).toHaveBeenCalled();
      expect(slides.renderSlides).not.toHaveBeenCalled();
    });

    it('in slides mode calls rehydrateSlides (fire-and-forget)', () => {
      appState.getBriefMode.mockReturnValue('slides');
      showBrief(meta);
      expect(scenePainter.rehydrateSlides).toHaveBeenCalled();
    });
  });

  describe('hideBrief()', () => {
    it('calls hideSlides and hideReport', () => {
      hideBrief();
      expect(slides.hideSlides).toHaveBeenCalled();
      expect(report.hideReport).toHaveBeenCalled();
    });
  });

  describe('slides:closed event', () => {
    it('calls clearAllSlides from scene-painter and clearDim', () => {
      initBriefController();
      document.dispatchEvent(new CustomEvent('slides:closed'));
      expect(scenePainter.clearAllSlides).toHaveBeenCalled();
      expect(nodesMod.clearDim).toHaveBeenCalled();
    });
  });

  describe('toggleReportMode()', () => {
    it('when brief is hidden and no docId: calls log with "no doc loaded"', () => {
      slides.isSlidesVisible.mockReturnValue(false);
      report.isReportVisible.mockReturnValue(false);
      appState.getLastLoadedDocId.mockReturnValue(null);
      localGraph.getDocMeta.mockReturnValue(null);

      toggleReportMode();

      expect(logMod.log).toHaveBeenCalledWith(
        'SYSTEM',
        expect.stringContaining('no doc loaded')
      );
    });

    it('when brief is hidden and docId exists: calls showBrief path (renderSlides)', () => {
      slides.isSlidesVisible.mockReturnValue(false);
      report.isReportVisible.mockReturnValue(false);
      appState.getLastLoadedDocId.mockReturnValue('doc-abc');
      localGraph.getDocMeta.mockReturnValue({ id: 'doc-abc', title: 'ABC' });
      appState.getBriefMode.mockReturnValue('slides');

      toggleReportMode();

      expect(slides.renderSlides).toHaveBeenCalled();
    });

    it('when brief is visible: calls hideBrief, sets aria-expanded to false on report-btn', () => {
      slides.isSlidesVisible.mockReturnValue(true);
      const reportBtn = document.getElementById('report-btn');
      reportBtn.setAttribute('aria-expanded', 'true');

      toggleReportMode();

      expect(slides.hideSlides).toHaveBeenCalled();
      expect(report.hideReport).toHaveBeenCalled();
      expect(reportBtn.getAttribute('aria-expanded')).toBe('false');
    });
  });
});
