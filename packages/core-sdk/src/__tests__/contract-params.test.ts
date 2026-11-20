import {
  Keypair,
  Operation,
  nativeToScVal,
  scValToNative,
  StrKey,
  xdr,
} from '@stellar/stellar-sdk';
import {
  CallerIdentity,
  toScAddress,
  toScAddressVec,
  toScBytes,
  toScBytesN32,
  toScCallerIdentity,
  toScI128,
  toScOperationsVec,
  toScOption,
  toScPermissionsVec,
  toScU32,
  toScU64,
} from '../contract-params';

const accountId = Keypair.random().publicKey();
const contractId = StrKey.encodeContract(Buffer.alloc(32, 7));

function roundTrip(value: xdr.ScVal): xdr.ScVal {
  return xdr.ScVal.fromXDR(value.toXDR());
}

describe('contract parameter ScVal encoders', () => {
  describe('addresses and bytes', () => {
    it.each([accountId, contractId])('encodes %s as a Soroban address', (address) => {
      const encoded = toScAddress(address);
      expect(encoded.switch().name).toBe('scvAddress');
      expect(roundTrip(encoded).switch().name).toBe('scvAddress');
      expect(scValToNative(roundTrip(encoded))).toBe(address);
    });

    it('rejects values that are not Stellar addresses', () => {
      expect(() => toScAddress('')).toThrow(/Invalid Stellar public key/);
      expect(() => toScAddress('not-an-address')).toThrow(/Invalid Stellar public key/);
    });

    it('encodes an Ed25519 public key as 32 bytes', () => {
      const encoded = toScBytesN32(accountId);
      expect(encoded.switch().name).toBe('scvBytes');
      expect(Buffer.from(encoded.bytes())).toEqual(
        Buffer.from(StrKey.decodeEd25519PublicKey(accountId))
      );
    });

    it('rejects a contract address when raw Ed25519 key bytes are required', () => {
      expect(() => toScBytesN32(contractId)).toThrow(/Invalid Stellar public key/);
      expect(() => toScBytesN32('')).toThrow(/Invalid Stellar public key/);
    });

    it('encodes Uint8Array and Buffer without changing bytes', () => {
      const bytes = Uint8Array.from([0, 1, 127, 128, 255]);
      for (const input of [bytes, Buffer.from(bytes)]) {
        const encoded = toScBytes(input);
        expect(encoded.switch().name).toBe('scvBytes');
        expect(Buffer.from(roundTrip(encoded).bytes())).toEqual(Buffer.from(bytes));
      }
    });

    it('encodes address vectors in their original order', () => {
      const encoded = toScAddressVec([accountId, contractId]);
      expect(encoded.switch().name).toBe('scvVec');
      expect(encoded.vec()).toHaveLength(2);
      expect(encoded.vec()!.every((item) => item.switch().name === 'scvAddress')).toBe(true);
    });

    it('rejects invalid addresses in address vectors', () => {
      expect(() => toScAddressVec(['not-an-address'])).toThrow();
    });
  });

  describe('integer encoders', () => {
    it('encodes u32 boundaries and round-trips through XDR', () => {
      for (const value of [0, 1, 0xffff_ffff]) {
        const encoded = roundTrip(toScU32(value));
        expect(encoded.switch().name).toBe('scvU32');
        expect(encoded.u32()).toBe(value);
      }
    });

    it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 0x1_0000_0000])(
      'rejects invalid u32 value %s',
      (value) => expect(() => toScU32(value)).toThrow(/Invalid u32 value/)
    );

    it('encodes zero and the largest safely representable u64', () => {
      for (const value of [0, Number.MAX_SAFE_INTEGER]) {
        const encoded = roundTrip(toScU64(value));
        expect(encoded.switch().name).toBe('scvU64');
        expect(encoded.u64().toString()).toBe(String(value));
      }
    });

    it.each([-1, 1.2, Number.NaN, Number.MAX_SAFE_INTEGER + 1])(
      'rejects invalid u64 value %s',
      (value) => expect(() => toScU64(value)).toThrow(/Invalid u64 value/)
    );

    it.each([0n, -1n, -(2n ** 127n), 2n ** 127n - 1n])(
      'encodes signed i128 boundary %s',
      (value) => {
        const encoded = roundTrip(toScI128(value));
        expect(encoded.switch().name).toBe('scvI128');
        expect(scValToNative(encoded)).toBe(value);
      }
    );

    it('accepts decimal string i128 values and rejects malformed strings', () => {
      expect(scValToNative(toScI128('-12345678901234567890'))).toBe(-12345678901234567890n);
      expect(() => toScI128('not-an-integer')).toThrow();
    });
  });

  describe('collections, options, and enum variants', () => {
    it('encodes permission vectors as ordered u32 values', () => {
      const encoded = roundTrip(toScPermissionsVec([2, 0, 1]));
      expect(encoded.switch().name).toBe('scvVec');
      expect(encoded.vec()!.map((item) => item.u32())).toEqual([2, 0, 1]);
      expect(toScPermissionsVec([]).vec()).toHaveLength(0);
    });

    it('rejects invalid permission values', () => {
      expect(() => toScPermissionsVec([0, -1])).toThrow(/Invalid u32 value/);
    });

    it('wraps None and Some options', () => {
      const none = roundTrip(toScOption(null, toScU32));
      expect(none.switch().name).toBe('scvVoid');
      const some = roundTrip(toScOption(42, (value: number) => toScU32(value)));
      expect(some.switch().name).toBe('scvU32');
      expect(some.u32()).toBe(42);
    });

    it('encodes Owner as a symbol and SessionKey/Quorum as tagged vectors', () => {
      const owner = roundTrip(toScCallerIdentity(CallerIdentity.Owner));
      expect(owner.switch().name).toBe('scvSymbol');
      expect(Buffer.from(owner.sym()).toString('utf8')).toBe('Owner');

      const sessionKey = toScCallerIdentity(CallerIdentity.SessionKey, toScBytesN32(accountId));
      expect(sessionKey.switch().name).toBe('scvVec');
      expect(Buffer.from(sessionKey.vec()![0].sym()).toString('utf8')).toBe('SessionKey');

      const quorum = toScCallerIdentity(CallerIdentity.Quorum, toScAddressVec([accountId]));
      expect(quorum.switch().name).toBe('scvVec');
      expect(Buffer.from(quorum.vec()![0].sym()).toString('utf8')).toBe('Quorum');
    });

    it('rejects enum variants that require data when none is supplied', () => {
      expect(() => toScCallerIdentity(CallerIdentity.SessionKey)).toThrow(/Invalid CallerIdentity/);
      expect(() => toScCallerIdentity(CallerIdentity.Quorum)).toThrow(/Invalid CallerIdentity/);
    });

    it('serializes and decodes bool ScVals using the Stellar SDK primitive', () => {
      for (const value of [true, false]) {
        const encoded = roundTrip(nativeToScVal(value, { type: 'bool' }));
        expect(encoded.switch().name).toBe('scvBool');
        expect(encoded.b()).toBe(value);
      }
    });

    it('encodes operations as XDR byte entries', () => {
      const operation = Operation.manageData({ name: 'test', value: 'value' });
      const encoded = roundTrip(toScOperationsVec([operation]));
      expect(encoded.switch().name).toBe('scvVec');
      expect(encoded.vec()).toHaveLength(1);
      expect(encoded.vec()![0].switch().name).toBe('scvBytes');
      expect(Buffer.from(encoded.vec()![0].bytes())).toEqual(Buffer.from(operation.toXDR()));
      expect(() => toScOperationsVec([])).toThrow(/non-empty array/);
    });
  });
});
