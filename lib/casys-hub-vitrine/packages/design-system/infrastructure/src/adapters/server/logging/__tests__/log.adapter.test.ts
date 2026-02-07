import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { LogConfig } from '@casys/shared';

import { createLogAdapter } from '../log.adapter';

describe('LogAdapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Additional console driver behaviors', () => {
    it('should gate debug when level is log', () => {
      const spyStdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true as any);
      const spyStderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true as any);

      const logger = createLogAdapter({ level: 'log', driver: 'console' }, 'Ctx');
      logger.debug('d');
      logger.log('l');
      logger.warn('w');
      logger.error('e');

      // debug est filtré -> aucune écriture pour debug
      // log et warn vont vers stdout, error vers stderr
      expect(spyStdout).toHaveBeenCalledTimes(2);
      expect(spyStderr).toHaveBeenCalledTimes(1);

      spyStdout.mockRestore();
      spyStderr.mockRestore();
    });

    it('should handle error without object gracefully', () => {
      const spyStderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true as any);
      const logger = createLogAdapter({ level: 'error', driver: 'console' }, 'Ctx');
      logger.error('only message');
      const line = spyStderr.mock.calls[0][0] as string;
      expect(line).toContain('only message');
      spyStderr.mockRestore();
    });
  });

  describe('Console driver', () => {
    it('should create console logger with default config', () => {
      const config: LogConfig = {
        level: 'log',
        driver: 'console',
      };

      const logger = createLogAdapter(config, 'TestContext');

      expect(logger).toBeDefined();
      expect(typeof logger.debug).toBe('function');
      expect(typeof logger.log).toBe('function');
      expect(typeof logger.warn).toBe('function');
      expect(typeof logger.error).toBe('function');
    });

    it('should respect log level filtering', () => {
      const consoleSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true as any);
      const config: LogConfig = {
        level: 'warn',
        driver: 'console',
      };

      const logger = createLogAdapter(config, 'TestContext');

      logger.debug('debug message');
      logger.log('log message');
      logger.warn('warn message');

      // Only warn should be logged due to level filtering (single formatted string)
      expect(consoleSpy).toHaveBeenCalledTimes(1);
      expect(consoleSpy.mock.calls[0][0]).toEqual(expect.stringContaining('[TestContext]'));
      expect(consoleSpy.mock.calls[0][0]).toEqual(expect.stringContaining('warn message'));

      consoleSpy.mockRestore();
    });

    it('should format messages with context', () => {
      const consoleSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true as any);
      const config: LogConfig = {
        level: 'debug',
        driver: 'console',
      };

      const logger = createLogAdapter(config, 'MyService');
      logger.log('test message', { key: 'value' });

      // Logger console sort une seule chaîne formatée
      const line = consoleSpy.mock.calls[0][0] as string;
      expect(line).toEqual(expect.stringContaining('[MyService]'));
      expect(line).toEqual(expect.stringContaining('test message'));
      expect(line).toEqual(expect.stringContaining('"key":"value"'));

      consoleSpy.mockRestore();
    });
  });

  describe('Pino driver', () => {
    it('should create pino logger when driver is pino', () => {
      const config: LogConfig = {
        level: 'log',
        driver: 'pino',
      };

      const logger = createLogAdapter(config, 'TestContext');

      expect(logger).toBeDefined();
      expect(typeof logger.debug).toBe('function');
      expect(typeof logger.log).toBe('function');
      expect(typeof logger.warn).toBe('function');
      expect(typeof logger.error).toBe('function');
    });

    it('should handle pino with file output', () => {
      const config: LogConfig = {
        level: 'debug',
        driver: 'pino',
        filePath: '/tmp/test.log',
      };

      // Should not throw even if file path is invalid in test
      expect(() => {
        const logger = createLogAdapter(config, 'TestContext');
        logger.log('test message');
      }).not.toThrow();
    });
  });

  describe('Error handling', () => {
    it('should handle invalid file paths gracefully', () => {
      const config: LogConfig = {
        level: 'debug',
        driver: 'console',
        filePath: '/invalid/path/test.log',
      };

      expect(() => {
        const logger = createLogAdapter(config, 'TestContext');
        logger.log('test message');
      }).not.toThrow();
    });

    it('should handle error objects in error method', () => {
      const consoleSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true as any);
      const config: LogConfig = {
        level: 'debug',
        driver: 'console',
      };

      const logger = createLogAdapter(config, 'TestContext');
      const testError = new Error('Test error');

      logger.error('Something went wrong', testError);

      const errLine = consoleSpy.mock.calls[0][0] as string;
      expect(errLine).toEqual(expect.stringContaining('[TestContext]'));
      expect(errLine).toEqual(expect.stringContaining('Something went wrong'));

      consoleSpy.mockRestore();
    });
  });
});
