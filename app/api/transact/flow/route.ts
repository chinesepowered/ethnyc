
import { NextResponse } from 'next/server';
import * as fcl from '@onflow/fcl';
import * as sdk from '@onflow/sdk';
import { ec as EC } from 'elliptic';

// --- SECURITY ---
// A hardcoded list of approved .find recipients.
const approvedRecipients = [
  'testnet-account.find', // Example, replace with actual .find names
  // Add other .find names here
];

// --- Cadence Transaction ---
const TRANSFER_FLOW_TRANSACTION = `
  import FungibleToken from 0xFungibleToken
  import FlowToken from 0xFlowToken

  transaction(amount: UFix64, to: Address) {
    let vault: @FungibleToken.Vault

    prepare(signer: auth(Borrow) &Account) {
      // Get a reference to the signer's FlowToken Vault
      self.vault = signer.storage.borrow<@FungibleToken.Vault>(from: /storage/flowTokenVault)
        ?? panic("Could not borrow reference to the owner's Vault!")
    }

    execute {
      // Get a reference to the recipient's FlowToken Receiver
      let receiver = getAccount(to).capabilities.borrow<&{FungibleToken.Receiver}>(/public/flowTokenReceiver)
        ?? panic("Could not borrow receiver reference to the recipient's Vault")

      // Withdraw FlowToken from the signer's Vault and deposit it into the receiver's Vault
      receiver.deposit(from: <- self.vault.withdraw(amount: amount))
    }
  }
`;

// --- Elliptic Curve Setup ---
const ec = new EC('p256');

// --- FCL Configuration ---
const configureFcl = (accessNode: string) => {
  fcl.config({
    "accessNode.api": accessNode,
    "flow.network": "testnet",
    "0xFlowToken": "0x7e60df042a9c0868",
    "0xFungibleToken": "0x9a0766d93b6608b7"
  });
};

// --- Signing Function ---
const signWithPrivateKey = (privateKey: string, msg: string) => {
  const key = ec.keyFromPrivate(Buffer.from(privateKey, "hex"));
  const sig = key.sign(Buffer.from(msg, "hex"));
  const n = 32;
  const r = sig.r.toArrayLike(Buffer, "be", n);
  const s = sig.s.toArrayLike(Buffer, "be", n);
  return Buffer.concat([r, s]).toString("hex");
};

export async function POST(request: Request) {
  try {
    const { amount, recipient } = await request.json();

    // --- VALIDATION ---
    if (!amount || !recipient || typeof amount !== 'number' || amount <= 0) {
      return NextResponse.json({ error: 'Invalid amount or recipient' }, { status: 400 });
    }

    // --- SECURITY CHECK ---
    if (!approvedRecipients.includes(recipient.toLowerCase())) {
      return NextResponse.json({ error: `Recipient '${recipient}' is not on the approved list.` }, { status: 403 });
    }

    const accessNode = process.env.FLOW_ACCESS_NODE;
    const privateKey = process.env.FLOW_PRIVATE_KEY;
    const accountAddress = process.env.FLOW_ACCOUNT_ADDRESS;

    if (!accessNode || !privateKey || !accountAddress) {
      throw new Error('Server environment variables for Flow are not set.');
    }

    configureFcl(accessNode);

    // --- .find NAME RESOLUTION ---
    const recipientAddress = await fcl.query({
      cadence: `
        import FIND from 0xFIND
        pub fun main(name: String): Address? {
          return FIND.lookupAddress(name)
        }
      `,
      args: (arg, t) => [arg(recipient, t.String)]
    });

    if (!recipientAddress) {
      return NextResponse.json({ error: `Could not resolve .find name: ${recipient}` }, { status: 404 });
    }

    // --- AUTHORIZATION ---
    const authorization = async (account: any) => {
      const key = await sdk.getAccount(accountAddress).then((acct: any) => acct.keys[0]);
      return {
        ...account,
        tempId: `${accountAddress}-${key.index}`,
        addr: sdk.sansPrefix(accountAddress),
        keyId: key.index,
        signingFunction: (signable: any) => ({
          addr: sdk.withPrefix(accountAddress),
          keyId: key.index,
          signature: signWithPrivateKey(privateKey, signable.message),
        }),
      };
    };

    // --- TRANSACTION ---
    const txId = await fcl.mutate({
      cadence: TRANSFER_FLOW_TRANSACTION,
      args: (arg, t) => [
        arg(amount.toFixed(8), t.UFix64), // Flow amounts need to be UFix64
        arg(recipientAddress, t.Address),
      ],
      proposer: authorization,
      payer: authorization,
      authorizations: [authorization],
      limit: 999,
    });

    console.log(`Flow transaction sent! ID: ${txId}`);
    await fcl.tx(txId).onceSealed();
    console.log(`Flow transaction sealed: ${txId}`);

    return NextResponse.json({ success: true, txId });

  } catch (error: any) {
    console.error("Flow Transaction Error:", error);
    return NextResponse.json({ error: error.message || "An unknown error occurred." }, { status: 500 });
  }
}
