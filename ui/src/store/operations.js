import { doFetch } from '../utils/fetch-websocket';

export function activateConnection(state) {
  return { ...state, active: true };
}
export function deactivateConnection(state) {
  return { ...state, active: false };
}

export function serverConnected(state) {
  return { ...state, connected: true };
}
export function serverDisconnected(state) {
  return { ...state, connected: false };
}

export function updatePurses(state, purses) {
  return { ...state, purses };
}
export function updateExchangeAmount(state, exchangeAmount) {
  return { ...state, exchangeAmount };
}

export function changePurse(
  state,
  { purse, fieldNumber, freeVariable = null },
) {
  let { inputPurse, outputPurse } = state;
  if (fieldNumber === 0) {
    inputPurse = purse;
    if (inputPurse === outputPurse) {
      outputPurse = null;
    }
  }
  if (fieldNumber === 1) {
    outputPurse = purse;
    if (outputPurse === inputPurse) {
      inputPurse = null;
    }
  }
  return { ...state, inputPurse, outputPurse, freeVariable };
}

export function changeAmount(
  state,
  { amount, fieldNumber, freeVariable = null },
) {
  let { inputAmount, outputAmount } = state;
  if (fieldNumber === 0) {
    inputAmount = amount;
  }
  if (fieldNumber === 1) {
    outputAmount = amount;
  }
  return { ...state, inputAmount, outputAmount, freeVariable };
}

export function swapInputs(state) {
  const { inputPurse, outputPurse, inputAmount, outputAmount } = state;
  return {
    ...state,
    inputPurse: outputPurse,
    outputPurse: inputPurse,
    inputAmount: outputAmount,
    outputAmount: inputAmount,
  };
}

export function createOffer(
  state,
  {
    instanceHandleBoardId,
    installationHandleBoardId,
    inviteDepositId,
    inputAmount,
    outputAmount,
    inputPurse,
    outputPurse,
  },
) {
  const offer = {
    // JSONable ID for this offer.  Eventually this will be scoped to
    // the current site.
    id: Date.now(),

    // TODO: get this from the invite instead in the wallet. We
    // don't want to trust the dapp on this.
    instanceHandleBoardId,
    installationHandleBoardId,

    proposalTemplate: {
      give: {
        In: {
          // The pursePetname identifies which purse we want to use
          pursePetname: inputPurse.pursePetname,
          value: inputAmount,
        },
      },
      want: {
        Out: {
          pursePetname: outputPurse.pursePetname,
          value: outputAmount,
        },
      },
      exit: { onDemand: null },
    },
  };

  // Create an invite for the offer and on response, send the proposed
  // offer to the wallet.
  doFetch(
    {
      type: 'autoswap/sendSwapInvite',
      data: {
        depositFacetId: inviteDepositId,
        offer,
      },
    },
    '/api',
  );

  return {
    ...state,
    inputPurse: null,
    outputPurse: null,
    inputAmount: null,
    outputAmount: null,
  };
}

export function updateInviteDepositId(state, inviteDepositId) {
  return { ...state, inviteDepositId };
}

export function resetState(state) {
  return {
    ...state,
    purses: null,
    inputPurse: null,
    outputPurse: null,
    inputAmount: null,
    outputAmount: null,
  };
}
