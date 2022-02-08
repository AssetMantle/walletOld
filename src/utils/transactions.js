import {DirectSecp256k1HdWallet} from "@cosmjs/proto-signing";
import config from "../config.json";
import Long from "long";
import {Tendermint34Client} from "@cosmjs/tendermint-rpc";
import {createProtobufRpcClient, setupAuthExtension, setupTxExtension} from "@cosmjs/stargate";
import TransportWebUSB from "@ledgerhq/hw-transport-webusb";
import {LedgerSigner} from "@cosmjs/ledger-amino";
import {fee} from "./aminoMsgHelper";
import * as Sentry from "@sentry/browser";
import {LOGIN_INFO} from "../constants/localStorage";
import {decodeTendermintClientStateAny, decodeTendermintConsensusStateAny, makeHdPath} from "./helper";
import {BaseAccount} from "cosmjs-types/cosmos/auth/v1beta1/auth";
import {SendMsg} from "./protoMsgHelper";
import {PubKey} from "cosmjs-types/cosmos/crypto/secp256k1/keys";

const {SigningStargateClient, QueryClient, setupIbcExtension, GasPrice} = require("@cosmjs/stargate");
const tmRPC = require("@cosmjs/tendermint-rpc");
const {TransferMsg} = require("./protoMsgHelper");
const addressPrefix = config.addressPrefix;
const configChainID = process.env.REACT_APP_CHAIN_ID;

const tendermintRPCURL = process.env.REACT_APP_TENDERMINT_RPC_ENDPOINT;

async function Transaction(wallet, signerAddress, msgs, fee, memo = "") {
    const gasPrice = GasPrice.fromString("0.025uxprt");
    console.log(gasPrice, "gasPrice");
    const cosmJS = await SigningStargateClient.connectWithSigner(
        tendermintRPCURL,
        wallet,
        {gasPrice:gasPrice}
    );
    // const autoGas = await cosmJS.simulate(signerAddress ,msgs, "");
    // const feeFinal = calculateFee(Math.round(autoGas * 0.025), gasPrice);
    console.log(gasPrice, "gasPrice");

    // console.log(await cosmJS.simulate(signerAddress,msgs, ""),"simulate result", wallet);
    console.log(await cosmJS.sign(signerAddress, msgs, fee, memo));
    // return await cosmJS.sign(signerAddress, msgs, "auto", memo);
}

export async function Simulate() {
    const tendermintClient = await tmRPC.Tendermint34Client.connect(tendermintRPCURL);
    const queryClient = new QueryClient(tendermintClient);
    const txEx = new setupTxExtension(queryClient);
    const authEx = new setupAuthExtension(queryClient);
    const authResp = await authEx.auth.account("persistence1wv9879c57ag7zthrtcvundrw3yvvt0a92wmmhq");
    const parsedAuthResp = BaseAccount.decode(authResp.value);
    const pubKey = PubKey.decode(parsedAuthResp.pubKey.value);
    console.log(authResp,  "parsedAuthResp", parsedAuthResp);
    const autoGas = await txEx.tx.simulate([SendMsg("persistence1wv9879c57ag7zthrtcvundrw3yvvt0a92wmmhq",
        "persistence1wv9879c57ag7zthrtcvundrw3yvvt0a92wmmhq", "1000000", "uxprt")], "",
    pubKey, parsedAuthResp.sequence);
    console.log(autoGas, "autoGas", parsedAuthResp);
    return autoGas.gasInfo.gasUsed;
}

async function TransactionWithKeplr(msgs, fee, memo = "", chainID = configChainID) {
    const [wallet, address] = await KeplrWallet(chainID);
    return Transaction(wallet, address, msgs, fee, memo);
}

async function KeplrWallet(chainID = configChainID) {
    await window.keplr.enable(chainID);
    const offlineSigner = window.getOfflineSigner(chainID);
    const accounts = await offlineSigner.getAccounts();
    return [offlineSigner, accounts[0].address];
}

async function TransactionWithLedger(msgs, fee, memo = "", hdpath = makeHdPath(), prefix = addressPrefix) {
    const [wallet, address] = await LedgerWallet(hdpath, prefix);
    return Transaction(wallet, address, msgs, fee, memo);
}

async function LedgerWallet(hdpath, prefix) {
    const interactiveTimeout = 120_000;

    async function createTransport() {
        const ledgerTransport = await TransportWebUSB.create(interactiveTimeout, interactiveTimeout);
        return ledgerTransport;
    }

    const transport = await createTransport();
    const signer = new LedgerSigner(transport, {
        testModeAllowed: true,
        hdPaths: [hdpath],
        prefix: prefix,
        ledgerAppName:config.persistenceLedgerAppName
    });
    const [firstAccount] = await signer.getAccounts();
    return [signer, firstAccount.address];
}

async function TransactionWithMnemonic(msgs, fee, memo, mnemonic, hdpath = makeHdPath(), bip39Passphrase = "", loginAddress, prefix = addressPrefix) {
    const loginInfo = JSON.parse(localStorage.getItem(LOGIN_INFO));
    if (loginInfo && loginInfo.loginMode === "normal") {
        const [wallet, address] = await MnemonicWalletWithPassphrase(mnemonic, hdpath, bip39Passphrase, prefix);
        if (address !== loginAddress) {
            throw new Error("Your sign in address and keystore file don’t match. Please try again or else sign in again.");
        }
        return Transaction(wallet, address, msgs, fee, memo);
    } else {
        const [wallet, address] = await LedgerWallet(hdpath, prefix);
        return Transaction(wallet, address, msgs, fee, memo);
    }
}

async function MnemonicWalletWithPassphrase(mnemonic, hdPath = makeHdPath(), password = "", prefix = addressPrefix) {
    const wallet = await DirectSecp256k1HdWallet.fromMnemonic(mnemonic, {
        prefix: prefix,
        bip39Password: password,
        hdPaths: [hdPath]
    });
    const [firstAccount] = await wallet.getAccounts();
    return [wallet, firstAccount.address];
}

async function MakeIBCTransferMsg(channel, fromAddress, toAddress, amount, timeoutHeight, timeoutTimestamp = config.timeoutTimestamp, denom = config.coinDenom, url, port = "transfer") {
    const tendermintClient = await tmRPC.Tendermint34Client.connect(tendermintRPCURL);
    const queryClient = new QueryClient(tendermintClient);

    const ibcExtension = setupIbcExtension(queryClient);

    const finalResponse = await ibcExtension.ibc.channel.clientState(port, channel).then(async (clientStateResponse) => {
        const clientStateResponseDecoded = decodeTendermintClientStateAny(clientStateResponse.identifiedClientState.clientState);
        timeoutHeight = {
            revisionHeight: clientStateResponseDecoded.latestHeight.revisionHeight.add(config.ibcRevisionHeightIncrement),
            revisionNumber: clientStateResponseDecoded.latestHeight.revisionNumber
        };
        if (url === undefined) {
            const consensusStateResponse = await ibcExtension.ibc.channel.consensusState(port, channel,
                clientStateResponseDecoded.latestHeight.revisionNumber.toInt(), clientStateResponseDecoded.latestHeight.revisionHeight.toInt());
            const consensusStateResponseDecoded = decodeTendermintConsensusStateAny(consensusStateResponse.consensusState);

            const timeoutTime = Long.fromNumber(consensusStateResponseDecoded.timestamp.getTime() / 1000).add(timeoutTimestamp).multiply(1000000000); //get time in nanoesconds
            return TransferMsg(channel, fromAddress, toAddress, amount, timeoutHeight, timeoutTime, denom, port);
        } else {
            const remoteTendermintClient = await tmRPC.Tendermint34Client.connect(url);
            const latestBlockHeight = (await remoteTendermintClient.status()).syncInfo.latestBlockHeight;
            timeoutHeight.revisionHeight = Long.fromNumber(latestBlockHeight).add(config.ibcRemoteHeightIncrement);
            const timeoutTime = Long.fromNumber(0);
            return TransferMsg(channel, fromAddress, toAddress, amount, timeoutHeight, timeoutTime, denom, port);
        }
    }).catch(error => {
        Sentry.captureException(error.response
            ? error.response.data.message
            : error.message);
        throw error;
    });
    return finalResponse;
}

async function RpcClient() {
    const tendermintClient = await Tendermint34Client.connect(tendermintRPCURL);
    const queryClient = new QueryClient(tendermintClient);
    return createProtobufRpcClient(queryClient);
}


async function getTransactionResponse(address, data, feeAmount, gas, mnemonic = "", txName, accountNumber = 0, addressIndex = 0, bip39Passphrase = "") {
    switch (txName) {
    case "send":
        return TransactionWithMnemonic(data.message, fee(Math.trunc(feeAmount), gas), data.memo,
            mnemonic, makeHdPath(accountNumber, addressIndex), bip39Passphrase, address);
    case "delegate":
        return TransactionWithMnemonic(data.message, fee(Math.trunc(feeAmount), gas), data.memo,
            mnemonic, makeHdPath(accountNumber, addressIndex), bip39Passphrase, address);
    case "withdrawMultiple":
        return TransactionWithMnemonic(data.message, fee(Math.trunc(feeAmount), gas), data.memo,
            mnemonic, makeHdPath(accountNumber, addressIndex), bip39Passphrase, address);
    case "withdrawAddress":
        return TransactionWithMnemonic(data.message, fee(Math.trunc(feeAmount), gas), data.memo,
            mnemonic, makeHdPath(accountNumber, addressIndex), bip39Passphrase, address);
    case "reDelegate":
        return TransactionWithMnemonic(data.message, fee(Math.trunc(feeAmount), gas), data.memo,
            mnemonic, makeHdPath(accountNumber, addressIndex), bip39Passphrase, address);
    case  "unbond":
        return TransactionWithMnemonic(data.message, fee(Math.trunc(feeAmount), gas), data.memo,
            mnemonic, makeHdPath(accountNumber, addressIndex), bip39Passphrase, address);
    case "withdrawValidatorRewards":
        return TransactionWithMnemonic(data.message, fee(Math.trunc(feeAmount), gas), data.memo,
            mnemonic, makeHdPath(accountNumber, addressIndex), bip39Passphrase, address);
    case "ibc":
        return TransactionWithMnemonic(data.message,
            fee(Math.trunc(feeAmount), gas), data.memo, mnemonic,
            makeHdPath(accountNumber, addressIndex), bip39Passphrase, address);
    }
    
}


export default {
    TransactionWithKeplr,
    TransactionWithMnemonic,
    TransactionWithLedger,
    MakeIBCTransferMsg,
    RpcClient,
    getTransactionResponse,
    LedgerWallet,
    MnemonicWalletWithPassphrase,
    Simulate
};
