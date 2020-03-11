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
  { instanceId, inputAmount, outputAmount, inputPurse, outputPurse },
) {
  const offerDesc = {
    id: Date.now(),

    // Contract-specific metadata.
    instanceRegKey: instanceId,
    contractIssuerIndexToRole: ['TokenA', 'TokenB', 'Liquidity'],

    // Format is:
    //   hooks[targetName][hookName] = [hookMethod, ...hookArgs].
    // Then is called within the wallet as:
    //   E(target)[hookMethod](...hookArgs)
    hooks: {
      publicAPI: {
        getInvite: ['makeInvite'], // E(publicAPI).makeInvite()
        offerAccepted: undefined, // Could be E(publicAPI)...
      },
      seat: {
        performOffer: ['swap'], // E(seat).swap()
      }
    },

    offerRulesTemplate: {
      offer: {
        // Roles that begin with $ are placeholders that say to use
        // the first role that matches the purse's brand.
        $InputToken: {
          // The pursePetname identifies which purse we want to use
          pursePetname: inputPurse.pursePetname,
          extent: inputAmount,
        },
      },
      want: {
        $OutputToken: {
          pursePetname: outputPurse.pursePetname,
          extent: outputAmount,
        },
      },
      exit: { onDemand: {} },
    },
  };

  // Actually make the offer.
  doFetch(
    {
      type: 'walletAddOffer',
      data: offerDesc,
    },
    true,
  );

  return {
    ...state,
    inputPurse: null,
    outputPurse: null,
    inputAmount: null,
    outputAmount: null,
  };
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
