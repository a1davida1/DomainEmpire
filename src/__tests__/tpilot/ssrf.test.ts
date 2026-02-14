import { describe, expect, it } from 'vitest';
import { SSRFError, validateUrl } from '@/lib/tpilot/core/ssrf';

describe('SSRF Validation', () => {
    it('rejects non-http protocols', async () => {
        await expect(validateUrl('file:///etc/passwd')).rejects.toBeInstanceOf(SSRFError);
    });

    it('rejects localhost ipv4 targets', async () => {
        await expect(validateUrl('http://127.0.0.1:8080/')).rejects.toBeInstanceOf(SSRFError);
    });

    it('rejects metadata service ip targets', async () => {
        await expect(validateUrl('http://169.254.169.254/latest/meta-data')).rejects.toBeInstanceOf(SSRFError);
    });
});

