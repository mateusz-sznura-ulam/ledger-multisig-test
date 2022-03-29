const algosdk = require("algosdk");
const msgpack = require("algo-msgpack-with-bigint"); // dep of algosdk, but should be explicitely added to package.json
const TransportWebUSB = require("@ledgerhq/hw-transport-node-hid").default;
const Algorand = require("@ledgerhq/hw-app-algorand").default;

const token = "8zV71DPDPd7X7zV4YXxPA9ZqSPalTOEP4DUHxhYH";
const tokenHeader = { "x-api-key": token };

const algodv2 = new algosdk.Algodv2(
  tokenHeader,
  "https://testnet-algorand.api.purestake.io/ps2",
  ""
);

const indexer = new algosdk.Indexer(
  tokenHeader,
  "https://testnet-algorand.api.purestake.io/idx2",
  ""
);

(async () => {
  // prepare account1 - output of algosdk.generateAccount()
  const account1 = {
    addr: "TQL2IMG5RCJMXGHIQ4V5B4NK52MBCUQ6X3H72TFADHP5DMAMK6LDH2CN4A",
    sk: new Uint8Array([
      11, 82, 199, 131, 182, 140, 62, 17, 205, 27, 84, 149, 13, 85, 77, 251, 61,
      19, 141, 164, 215, 16, 66, 196, 203, 212, 140, 66, 92, 73, 40, 83, 156,
      23, 164, 48, 221, 136, 146, 203, 152, 232, 135, 43, 208, 241, 170, 238,
      152, 17, 82, 30, 190, 207, 253, 76, 160, 25, 223, 209, 176, 12, 87, 150,
    ]),
  };
  console.log(`algosdk address: ${account1.addr}`);

  const transport = await TransportWebUSB.create();
  const algo = new Algorand(transport);

  // prepare account2 - ledger account
  console.log(
    "getting address from ledger - go to your ledger device and confirm"
  );
  const { publicKey, address } = await algo.getAddress("44'/283'/0'/0/0", {
    verify: true,
    format: "legacy",
  });
  const account2 = {
    addr: address,
  };
  console.log(`ledger address: ${account2.addr}`);

  const mparams = {
    version: 1,
    threshold: 2,
    addrs: [account1.addr, account2.addr],
  };

  const multsigAddress = algosdk.multisigAddress(mparams);
  console.log(`multisig address: ${multsigAddress}`); // OQ2MZA7ROGE6GRWMNMZ5254P63W44WDJS6VPDMXB5PZJNAMQWPXHUKBVM4

  const multsigAddressAccount = await indexer
    .lookupAccountByID(multsigAddress)
    .do();
  console.log(
    `multisig address balance: ${multsigAddressAccount.account.amount}`
  );

  // my Algosigner account
  const receiverAddress =
    "YI55NS7YLGR7VGPI26SESVXGBHXHCIROZ44EUPFT3H6JAXHIBRD5H2GEMU";

  const suggestedParams = await algodv2.getTransactionParams().do();
  const txn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
    from: multsigAddress,
    to: receiverAddress,
    amount: 1000, // 1 uALGO
    note: new TextEncoder().encode("Pozdro z Rotterdamu"),
    suggestedParams,
  });

  console.log(
    "signing transaction with ledger - go to your ledger device and confirm"
  );
  const { signature } = await algo.sign("44'/283'/0'/0/0", txn.toByte()); // returns nodejs Buffer
  const bytesSignature = new Uint8Array(signature); // this step is probably not needed
  console.log(`ledger signature: `, new Uint8Array(bytesSignature));

  const bytesPartiallySignedTxn = algosdk.signMultisigTransaction(
    txn,
    mparams,
    account1.sk
  );
  console.log(bytesPartiallySignedTxn);

  const decodedPartiallySignedTxn = decode(bytesPartiallySignedTxn.blob); // this decodes bytes, but contrary to algosdk.decodeSignedTransaction, it leaves txn in "obj_for_encoding" form
  console.log('partially signed txn:\n', decodedPartiallySignedTxn);
  console.log('partially signed txn subsig:\n', decodedPartiallySignedTxn.msig.subsig);

  const fullySignedTxn = {
    ...decodedPartiallySignedTxn,
    msig: {
      ...decodedPartiallySignedTxn.msig,
      subsig: [
        {
          ...decodedPartiallySignedTxn.msig.subsig[0],
        },
        {
          ...decodedPartiallySignedTxn.msig.subsig[1],
          s: bytesSignature,
        },
      ],
    },
  };
  console.log('fully signed txn:\n', fullySignedTxn);
  console.log('fully signed txn subsig:\n', fullySignedTxn.msig.subsig);

  const encodedFullySignedTxn = encode(fullySignedTxn);

  const sentTx = await algodv2.sendRawTransaction(encodedFullySignedTxn).do();
  console.log(`transaction: ${sentTx.txId}`);
})();

// those functions are copied from encoding/encoding module of algosdk
function encode(obj) {
  const options = { sortKeys: true };
  return msgpack.encode(obj, options);
}

function decode(buffer) {
  return msgpack.decode(buffer);
}
