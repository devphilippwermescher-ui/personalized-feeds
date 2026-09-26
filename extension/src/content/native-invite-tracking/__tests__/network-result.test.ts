import { describe, expect, it } from 'vitest';
import {
  isInviteCreationRequest,
  isPotentialInviteRequest,
  isSuccessfulInviteCreationResponse,
  parseNativeInviteNetworkResult,
} from '../parsers/network-result';

describe('native invite network parser', () => {
  it('recognizes and parses My Network direct RSC invitations', () => {
    const url =
      'https://www.linkedin.com/flagship-web/rsc-action/actions/server-request?' +
      'sduiid=com.linkedin.sdui.requests.mynetwork.addaAddConnection&parentSpanId=test';
    const response =
      '0:{"states":[{"key":{"key":{"value":{"id":"state:invitation:urn:li:member:1239612007"}}},' +
      '"value":{"stringValue":"Pending"}}]}';

    expect(isPotentialInviteRequest(url)).toBe(true);
    expect(isInviteCreationRequest(url)).toBe(true);
    expect(isSuccessfulInviteCreationResponse(url, response)).toBe(true);
    expect(parseNativeInviteNetworkResult('', response)).toMatchObject({
      memberNumericId: '1239612007',
    });
  });

  it('recognizes Voyager invitations and extracts all stable identities', () => {
    const url =
      'https://www.linkedin.com/voyager/api/voyagerRelationshipsDashMemberRelationships?' +
      'action=verifyQuotaAndCreateV2&decorationId=test';
    const requestBody =
      '{"inviteeVanityName":"viacheslav-susla-01abb22b2","memberId":"1263053974",' +
      '"profileUrn":"urn:li:fsd_profile:ACoAAEtIrJYBUEvqbvllaCkQ58b9EyOTw-b3Q5Y"}';
    const response = '{"invitationUrn":"urn:li:fsd_invitation:7492125398114406400"}';

    expect(isInviteCreationRequest(url, requestBody)).toBe(true);
    expect(isSuccessfulInviteCreationResponse(url, response)).toBe(true);
    expect(parseNativeInviteNetworkResult(requestBody, response)).toEqual({
      linkedinUsername: 'viacheslav-susla-01abb22b2',
      profileUrn: 'urn:li:fsd_profile:ACoAAEtIrJYBUEvqbvllaCkQ58b9EyOTw-b3Q5Y',
      memberNumericId: '1263053974',
      invitationUrn: 'urn:li:fsd_invitation:7492125398114406400',
    });
  });

  it('does not count a logical My Network RSC failure as a sent invitation', () => {
    const url =
      'https://www.linkedin.com/flagship-web/rsc-action/actions/server-request?' +
      'sduiid=com.linkedin.sdui.requests.mynetwork.addaAddConnection';

    expect(isSuccessfulInviteCreationResponse(url, '{"errors":[{"message":"blocked"}]}')).toBe(false);
  });
});
