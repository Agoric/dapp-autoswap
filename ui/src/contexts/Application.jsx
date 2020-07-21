import React, {
  createContext,
  useContext,
  useCallback,
  useReducer,
  useEffect,
} from 'react';

import {
  activateWebSocket,
  deactivateWebSocket,
  doFetch,
} from '../utils/fetch-websocket';
import {
  updatePurses,
  updateInviteDepositId,
  serverConnected,
  serverDisconnected,
  deactivateConnection,
  changeAmount,
  resetState,
} from '../store/actions';
import { reducer, createDefaultState } from '../store/reducer';
import dappConstants from '../utils/constants';

const { INVITE_BRAND_BOARD_ID } = dappConstants;

export const ApplicationContext = createContext();

export function useApplicationContext() {
  return useContext(ApplicationContext);
}

/* eslint-disable complexity, react/prop-types */
export default function Provider({ children }) {
  const [state, dispatch] = useReducer(reducer, createDefaultState());
  const {
    active,
    inputPurse,
    outputPurse,
    inputAmount,
    outputAmount,
    freeVariable,
  } = state;

  useEffect(() => {
    function messageHandler(message) {
      if (!message) return;
      const { type, data } = message;
      if (type === 'walletUpdatePurses') {
        dispatch(updatePurses(JSON.parse(data)));
      } else if (type === 'walletDepositFacetIdResponse') {
        dispatch(updateInviteDepositId(data));
      }
    }

    function walletGetPurses() {
      return doFetch({ type: 'walletGetPurses' }).then(messageHandler);
    }

    function walletGetInviteDepositId() {
      console.log('INVITE_BRAND_BOARD_ID', INVITE_BRAND_BOARD_ID);
      return doFetch({
        type: 'walletGetDepositFacetId',
        brandBoardId: INVITE_BRAND_BOARD_ID,
      });
    }

    activateWebSocket({
      onConnect() {
        dispatch(serverConnected());
        walletGetPurses();
        walletGetInviteDepositId();
      },
      onDisconnect() {
        dispatch(serverDisconnected());
        dispatch(deactivateConnection());
        dispatch(resetState());
      },
      onMessage(data) {
        messageHandler(JSON.parse(data));
      },
    });
    return deactivateWebSocket;
  }, []);

  const apiMessageHandler = useCallback(
    message => {
      if (!message) return;
      const { type, data } = message;
      if (type === 'autoswap/getCurrentPriceResponse') {
        dispatch(changeAmount(data, 1 - freeVariable));
      } else if (type === 'autoswap/sendSwapInviteResponse') {
        // Once the invite has been sent to the user, we update the
        // offer to include the inviteHandleBoardId. Then we make a
        // request to the user's wallet to send the proposed offer for
        // acceptance/rejection.
        const { offer } = data;
        doFetch({
          type: 'walletAddOffer',
          data: offer,
        });
      }
    },
    [freeVariable],
  );

  useEffect(() => {
    if (active) {
      activateWebSocket(
        {
          onConnect() {
            console.log('connected to API');
          },
          onDisconnect() {
            console.log('disconnected from API');
          },
          onMessage(message) {
            apiMessageHandler(JSON.parse(message));
          },
        },
        '/api',
      );
    } else {
      deactivateWebSocket('/api');
    }
  }, [active, apiMessageHandler]);

  useEffect(() => {
    if (inputPurse && outputPurse && freeVariable === 0 && inputAmount > 0) {
      doFetch(
        {
          type: 'autoswap/getCurrentPrice',
          data: {
            amountIn: { brand: inputPurse.brandBoardId, value: inputAmount },
            brandOut: outputPurse.brandBoardId,
          },
        },
        '/api',
      ).then(apiMessageHandler);
    }

    if (inputPurse && outputPurse && freeVariable === 1 && outputAmount > 0) {
      doFetch(
        {
          type: 'autoswap/getCurrentPrice',
          data: {
            amountIn: { brand: outputPurse.brandBoardId, value: outputAmount },
            brandOut: inputPurse.brandBoardId,
          },
        },
        '/api',
      ).then(apiMessageHandler);
    }
  }, [
    inputPurse,
    outputPurse,
    inputAmount,
    outputAmount,
    apiMessageHandler,
    freeVariable,
  ]);

  return (
    <ApplicationContext.Provider value={{ state, dispatch }}>
      {children}
    </ApplicationContext.Provider>
  );
}
/* eslint-enable complexity, react/prop-types */
